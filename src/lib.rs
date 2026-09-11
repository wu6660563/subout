pub mod auto_update;
pub mod db;
pub mod fetcher;
pub mod generator;
pub mod kernel;
pub mod parser;
pub mod paths;
pub mod platform;
pub mod service;
pub mod simple_config;
pub mod web;

use chrono::NaiveDate;
use parser::Outbound;
use percent_encoding::percent_decode_str;
use serde::{Deserialize, Serialize};
use std::net::{IpAddr, SocketAddr};
use url::Url;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct SubscriptionUserInfo {
    pub upload: Option<i64>,
    pub download: Option<i64>,
    pub total: Option<i64>,
    pub remaining: Option<i64>,
    pub expire: Option<i64>,
}

impl SubscriptionUserInfo {
    pub fn merge(mut self, other: SubscriptionUserInfo) -> Self {
        if self.upload.is_none() {
            self.upload = other.upload;
        }
        if self.download.is_none() {
            self.download = other.download;
        }
        if self.total.is_none() {
            self.total = other.total;
        }
        if self.remaining.is_none() {
            self.remaining = other.remaining;
        }
        if self.expire.is_none() {
            self.expire = other.expire;
        }
        self
    }
}

pub fn parse_userinfo_str(s: &str) -> SubscriptionUserInfo {
    let mut info = SubscriptionUserInfo::default();
    for part in s.split([';', '&', '\n']) {
        let part = part.trim();
        if let Some((k, v)) = part.split_once('=') {
            let key = k.trim().to_lowercase();
            let val = v.trim().parse::<i64>().ok();
            match key.as_str() {
                "upload" => info.upload = val,
                "download" => info.download = val,
                "total" => info.total = val,
                "remaining" | "remain" => info.remaining = val,
                "expire" => info.expire = val,
                _ => {}
            }
        }
    }
    info
}

fn parse_size_value(input: &str) -> Option<i64> {
    let start = input
        .char_indices()
        .find(|(_, ch)| ch.is_ascii_digit())
        .map(|(idx, _)| idx)?;
    let end = input[start..]
        .char_indices()
        .find(|(_, ch)| !ch.is_ascii_digit() && *ch != '.')
        .map(|(idx, _)| start + idx)
        .unwrap_or(input.len());
    let value = input[start..end].parse::<f64>().ok()?;
    let unit = input[end..]
        .trim_start()
        .chars()
        .take_while(|ch| ch.is_ascii_alphabetic())
        .collect::<String>()
        .to_lowercase();
    let multiplier = match unit.as_str() {
        "pb" | "pib" | "p" => 1024_f64.powi(5),
        "tb" | "tib" | "t" => 1024_f64.powi(4),
        "gb" | "gib" | "g" => 1024_f64.powi(3),
        "mb" | "mib" | "m" => 1024_f64.powi(2),
        "kb" | "kib" | "k" => 1024_f64,
        _ => 1_f64,
    };
    Some((value * multiplier).round() as i64)
}

fn parse_labeled_size(text: &str, labels: &[&str]) -> Option<i64> {
    let lower = text.to_lowercase();
    labels.iter().find_map(|label| {
        lower
            .find(&label.to_lowercase())
            .and_then(|pos| parse_size_value(&text[pos + label.len()..]))
    })
}

fn parse_labeled_date(text: &str, labels: &[&str]) -> Option<i64> {
    let lower = text.to_lowercase();
    labels.iter().find_map(|label| {
        let pos = lower.find(&label.to_lowercase())?;
        text[pos + label.len()..]
            .split(|ch: char| !ch.is_ascii_digit() && ch != '-')
            .find_map(|part| {
                if part.len() != 10 {
                    return None;
                }
                NaiveDate::parse_from_str(part, "%Y-%m-%d")
                    .ok()?
                    .and_hms_opt(23, 59, 59)
                    .map(|dt| dt.and_utc().timestamp())
            })
    })
}

fn parse_userinfo_text(text: &str) -> SubscriptionUserInfo {
    let lower = text.to_lowercase();
    let mut info = if let Some(pos) = lower.find("subscription-userinfo:") {
        parse_userinfo_str(&text[pos + "subscription-userinfo:".len()..])
    } else if let Some(pos) = lower.find("subscription-userinfo=") {
        parse_userinfo_str(&text[pos + "subscription-userinfo=".len()..])
    } else {
        parse_userinfo_str(text.trim_start_matches('#').trim_start_matches("//").trim())
    };

    if info.remaining.is_none() {
        info.remaining = parse_labeled_size(
            text,
            &[
                "剩余流量",
                "remaining traffic",
                "traffic remaining",
                "remaining",
            ],
        );
    }
    if info.expire.is_none() {
        info.expire = parse_labeled_date(text, &["套餐到期", "到期时间", "expire date", "expires"]);
    }
    info
}

pub fn parse_userinfo_from_body(body: &str) -> SubscriptionUserInfo {
    let decoded_body = parser::decode_base64(body.to_string()).unwrap_or_else(|| body.to_string());
    let mut result = SubscriptionUserInfo::default();
    for line in decoded_body.lines() {
        let mut info = parse_userinfo_text(line);
        if let Some(fragment) = line.split_once('#').map(|(_, fragment)| fragment) {
            let decoded_fragment = percent_decode_str(fragment).decode_utf8_lossy();
            info = info.merge(parse_userinfo_text(&decoded_fragment));
        }
        result = result.merge(info);
    }
    result
}

/// Fetches raw subscription content from the given URL.
pub async fn fetch_subscription(url: &str) -> anyhow::Result<String> {
    let (content, _) = fetch_subscription_with_info(url).await?;
    Ok(content)
}

/// Fetches subscription content and metadata (traffic, expire).
pub async fn fetch_subscription_with_info(
    url: &str,
) -> anyhow::Result<(String, SubscriptionUserInfo)> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(30))
        .build()?;

    let response = get_public_http_response(&client, url)
        .await?
        .error_for_status()?;

    let mut header_info = SubscriptionUserInfo::default();
    if let Some(userinfo_val) = response
        .headers()
        .get("subscription-userinfo")
        .or_else(|| response.headers().get("Subscription-Userinfo"))
        && let Ok(userinfo_str) = userinfo_val.to_str()
    {
        header_info = parse_userinfo_str(userinfo_str);
    }

    let text = response.text().await?;
    let body_info = parse_userinfo_from_body(&text);
    let final_info = header_info.merge(body_info);

    Ok((text, final_info))
}

pub async fn parse_subscription_url(url: &str) -> anyhow::Result<Vec<Outbound>> {
    let content = fetch_subscription(url).await?;
    let (outbounds, _) = parser::parse_subscription(&content, false);
    Ok(outbounds)
}

/// Validates an HTTP(S) URL and requires every resolved address to be public.
/// This keeps management actions from being used to access loopback/LAN/metadata services.
pub async fn validate_public_http_url(raw_url: &str) -> anyhow::Result<Url> {
    let url = Url::parse(raw_url).map_err(|e| anyhow::anyhow!("URL 格式无效: {}", e))?;
    if !matches!(url.scheme(), "http" | "https") {
        anyhow::bail!("仅允许 HTTP 或 HTTPS 地址");
    }
    let host = url
        .host_str()
        .ok_or_else(|| anyhow::anyhow!("URL 缺少主机名"))?;
    let port = url
        .port_or_known_default()
        .ok_or_else(|| anyhow::anyhow!("URL 缺少有效端口"))?;

    if let Ok(ip) = host.parse::<IpAddr>() {
        if !is_public_ip(ip) {
            anyhow::bail!("不允许访问本机、私网、链路本地或保留地址");
        }
        return Ok(url);
    }

    let addresses: Vec<SocketAddr> = tokio::net::lookup_host((host, port)).await?.collect();
    if addresses.is_empty() || addresses.iter().any(|addr| !is_public_ip(addr.ip())) {
        anyhow::bail!("域名解析到了本机、私网、链路本地或保留地址");
    }
    Ok(url)
}

pub async fn get_public_http_response(
    client: &reqwest::Client,
    raw_url: &str,
) -> anyhow::Result<reqwest::Response> {
    let mut url = validate_public_http_url(raw_url).await?;
    for _ in 0..=10 {
        let response = client.get(url.clone()).send().await?;
        if !response.status().is_redirection() {
            return Ok(response);
        }
        let location = response
            .headers()
            .get(reqwest::header::LOCATION)
            .ok_or_else(|| anyhow::anyhow!("重定向响应缺少 Location"))?
            .to_str()?;
        let next_url = url.join(location)?;
        url = validate_public_http_url(next_url.as_str()).await?;
    }
    anyhow::bail!("重定向次数超过 10 次")
}

fn is_singbox_fake_ip(ip: IpAddr) -> bool {
    match ip {
        // sing-box FakeIP 的默认 IPv4 范围。
        IpAddr::V4(v4) => {
            let o = v4.octets();
            o[0] == 198 && (o[1] == 18 || o[1] == 19)
        }
        // 本系统的 FakeIP IPv6 常用范围；只对域名解析结果放行，永不放行 IP 字面量。
        IpAddr::V6(v6) => {
            let o = v6.octets();
            o[0] == 0xfc && o[1] == 0 && (o[2] & 0xc0) == 0
        }
    }
}

/// 网站/节点拨测专用校验。任意 HTTP(S) 域名都可测试，仍拒绝 IP 字面量中的
/// 回环、私网、链路本地和保留地址。唯一例外是“域名”被本机 sing-box FakeIP
/// 映射后的地址：该地址只会由 TUN 接管并再解析为该域名，不能误判为内网。
pub async fn validate_site_test_http_url(raw_url: &str) -> anyhow::Result<Url> {
    let url = Url::parse(raw_url).map_err(|e| anyhow::anyhow!("URL 格式无效: {}", e))?;
    if !matches!(url.scheme(), "http" | "https") {
        anyhow::bail!("仅允许 HTTP 或 HTTPS 地址");
    }
    let host = url
        .host_str()
        .ok_or_else(|| anyhow::anyhow!("URL 缺少主机名"))?;
    let port = url
        .port_or_known_default()
        .ok_or_else(|| anyhow::anyhow!("URL 缺少有效端口"))?;

    // 不允许用户直接把 URL 指向 FakeIP 或任何非公网 IP。
    if let Ok(ip) = host.parse::<IpAddr>() {
        if !is_public_ip(ip) {
            anyhow::bail!("不允许访问本机、私网、链路本地或保留地址");
        }
        return Ok(url);
    }

    let addresses: Vec<SocketAddr> = tokio::net::lookup_host((host, port)).await?.collect();
    if addresses.is_empty()
        || addresses
            .iter()
            .any(|addr| !is_public_ip(addr.ip()) && !is_singbox_fake_ip(addr.ip()))
    {
        anyhow::bail!("域名解析到了本机、私网、链路本地或保留地址");
    }
    Ok(url)
}

/// 获取网站测试响应。每次重定向都使用网站拨测校验；由此允许任意安全的公网
/// URL，同时兼容 TUN/FakeIP，而订阅抓取仍使用更严格的公网校验。
pub async fn get_site_test_http_response(
    client: &reqwest::Client,
    raw_url: &str,
) -> anyhow::Result<reqwest::Response> {
    let mut url = validate_site_test_http_url(raw_url).await?;
    for _ in 0..=10 {
        let response = client.get(url.clone()).send().await?;
        if !response.status().is_redirection() {
            return Ok(response);
        }
        let location = response
            .headers()
            .get(reqwest::header::LOCATION)
            .ok_or_else(|| anyhow::anyhow!("重定向响应缺少 Location"))?
            .to_str()?;
        let next_url = url.join(location)?;
        url = validate_site_test_http_url(next_url.as_str()).await?;
    }
    anyhow::bail!("重定向次数超过 10 次")
}

pub fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let o = v4.octets();
            !(o[0] == 0
                || o[0] == 10
                || o[0] == 127
                || (o[0] == 100 && (64..=127).contains(&o[1]))
                || (o[0] == 169 && o[1] == 254)
                || (o[0] == 172 && (16..=31).contains(&o[1]))
                || (o[0] == 192 && (o[1] == 0 || o[1] == 168))
                || (o[0] == 192 && o[1] == 0 && o[2] == 2)
                || (o[0] == 198 && (o[1] == 18 || o[1] == 19 || o[1] == 51 && o[2] == 100))
                || (o[0] == 203 && o[1] == 0 && o[2] == 113)
                || o[0] >= 224)
        }
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                return is_public_ip(IpAddr::V4(v4));
            }
            let o = v6.octets();
            !(v6.is_loopback()
                || v6.is_unspecified()
                || (o[0] & 0xfe == 0xfc) // unique-local fc00::/7
                || (o[0] == 0xfe && (o[1] & 0xc0) == 0x80) // link-local fe80::/10
                || o[0] == 0xff // multicast
                || (o[0] == 0x20 && o[1] == 0x01 && o[2] == 0x0d && o[3] == 0xb8))
        }
    }
}

/// Loads subscription content from a source string (URL, file path, or raw content).
pub async fn load_subscription_content(
    source: &str,
) -> Result<(String, String), Box<dyn std::error::Error>> {
    if source.starts_with("http://") || source.starts_with("https://") {
        let content = fetch_subscription(source).await?;
        Ok((content, format!("URL: {}", source)))
    } else if std::path::Path::new(source).exists() {
        let content = std::fs::read_to_string(source)?;
        Ok((content, format!("File: {}", source)))
    } else {
        Ok((source.to_string(), "Inline Raw Content".to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_userinfo_str() {
        let s = "upload=123456; download=987654; total=107374182400; expire=1780000000";
        let info = parse_userinfo_str(s);
        assert_eq!(info.upload, Some(123456));
        assert_eq!(info.download, Some(987654));
        assert_eq!(info.total, Some(107374182400));
        assert_eq!(info.expire, Some(1780000000));
    }

    #[test]
    fn test_parse_userinfo_from_body_comments() {
        let body = "# subscription-userinfo: upload=100; download=200; total=1000; expire=1780000000\nvless://test";
        let info = parse_userinfo_from_body(body);
        assert_eq!(info.upload, Some(100));
        assert_eq!(info.download, Some(200));
        assert_eq!(info.total, Some(1000));
        assert_eq!(info.expire, Some(1780000000));
    }

    #[test]
    fn test_parse_userinfo_from_base64_node_remarks() {
        use base64::Engine as _;

        let content = "hysteria2://example:443#%E5%89%A9%E4%BD%99%E6%B5%81%E9%87%8F%EF%BC%9A47.85%20GB\nhysteria2://example:443#%E5%A5%97%E9%A4%90%E5%88%B0%E6%9C%9F%EF%BC%9A2027-11-14";
        let encoded = base64::engine::general_purpose::STANDARD.encode(content);
        let info = parse_userinfo_from_body(&encoded);

        assert_eq!(info.remaining, Some(51_378_546_278));
        assert!(info.expire.is_some());
    }

    #[test]
    fn test_public_ip_filter_rejects_private_and_reserved_ranges() {
        for address in [
            "127.0.0.1",
            "10.0.0.1",
            "192.168.1.1",
            "169.254.1.1",
            "::1",
            "fc00::1",
            "fe80::1",
        ] {
            assert!(
                !is_public_ip(address.parse().unwrap()),
                "{} should be blocked",
                address
            );
        }
        assert!(is_public_ip("1.1.1.1".parse().unwrap()));
        assert!(is_public_ip("2606:4700:4700::1111".parse().unwrap()));
    }

    #[test]
    fn test_site_test_ip_rules() {
        assert!(is_singbox_fake_ip("198.18.0.1".parse().unwrap()));
        assert!(is_singbox_fake_ip("198.19.255.254".parse().unwrap()));
        assert!(!is_singbox_fake_ip("198.20.0.1".parse().unwrap()));
        assert!(!is_singbox_fake_ip("127.0.0.1".parse().unwrap()));
    }
}
