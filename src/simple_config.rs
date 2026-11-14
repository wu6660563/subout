use anyhow::Result;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::db;
use crate::generator;

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct SimpleDnsConfig {
    pub mode: String, // "preset_fakeip" | "preset_domestic_foreign" | "fast_public" | "custom"
    pub domestic_dns: String, // "223.5.5.5"
    pub foreign_dns: String, // "fakeip" | "https://1.1.1.1/dns-query"
}

impl Default for SimpleDnsConfig {
    fn default() -> Self {
        Self {
            mode: "preset_fakeip".to_string(),
            domestic_dns: "223.5.5.5".to_string(),
            foreign_dns: "fakeip".to_string(),
        }
    }
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct SimpleInboundConfig {
    pub inbound_type: String, // "mixed" | "tun"
    pub mixed_port: u16,      // 2080
    pub allow_lan: bool,      // false
    pub tun_stack: String,    // "system"
    pub tun_auto_route: bool, // true
}

impl Default for SimpleInboundConfig {
    fn default() -> Self {
        Self {
            inbound_type: "tun".to_string(),
            mixed_port: 2080,
            allow_lan: false,
            tun_stack: "system".to_string(),
            tun_auto_route: true,
        }
    }
}

fn default_rule_set_source() -> String {
    "jsdelivr".to_string()
}

fn default_rule_set_detour() -> String {
    "auto".to_string()
}

#[derive(Clone, Serialize, Deserialize, Debug, Default, PartialEq, Eq)]
pub struct SimpleCustomRuleSets {
    #[serde(default)]
    pub geosite_cn_url: Option<String>,
    #[serde(default)]
    pub geosite_geolocation_not_cn_url: Option<String>,
    #[serde(default)]
    pub geoip_cn_url: Option<String>,
    #[serde(default)]
    pub geosite_ads_url: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct SimpleRouteConfig {
    pub mode: String, // "smart" (白名单/绕过大陆) | "global" (全局代理) | "gfw" (仅代理被阻断)
    pub block_ads: bool,
    pub bypass_lan: bool,
    pub default_outbound: String, // "AUTO-Test" | "proxy" | "direct"
    #[serde(default = "default_rule_set_source")]
    pub rule_set_source: String, // "jsdelivr" | "ghproxy" | "github" | "metacubex" | "custom"
    #[serde(default = "default_rule_set_detour")]
    pub rule_set_detour: String, // "auto" | "proxy" | "direct"
    #[serde(default)]
    pub custom_rule_sets: Option<SimpleCustomRuleSets>,
    #[serde(default = "default_true")]
    pub use_local_rule_sets: bool,
}

impl Default for SimpleRouteConfig {
    fn default() -> Self {
        Self {
            mode: "smart".to_string(),
            block_ads: true,
            bypass_lan: true,
            default_outbound: "AUTO-Test".to_string(),
            rule_set_source: default_rule_set_source(),
            rule_set_detour: default_rule_set_detour(),
            custom_rule_sets: None,
            use_local_rule_sets: true,
        }
    }
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq, Eq)]
pub struct RuleSetStatusInfo {
    pub tag: String,
    pub cached: bool,
    pub size: Option<u64>,
    pub updated_at: Option<i64>,
    pub path: String,
    pub url: String,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResolvedRuleSetUrls {
    pub geosite_cn: String,
    pub geosite_geolocation_not_cn: String,
    pub geoip_cn: String,
    pub geosite_ads: String,
}

pub fn resolve_rule_set_urls(cfg: &SimpleRouteConfig) -> ResolvedRuleSetUrls {
    let source = cfg.rule_set_source.trim().to_lowercase();
    let mut urls = match source.as_str() {
        "github" => ResolvedRuleSetUrls {
            geosite_cn: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-cn.srs".to_string(),
            geosite_geolocation_not_cn: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-geolocation-!cn.srs".to_string(),
            geoip_cn: "https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-cn.srs".to_string(),
            geosite_ads: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-category-ads-all.srs".to_string(),
        },
        "ghproxy" => ResolvedRuleSetUrls {
            geosite_cn: "https://ghp.ci/https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-cn.srs".to_string(),
            geosite_geolocation_not_cn: "https://ghp.ci/https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-geolocation-!cn.srs".to_string(),
            geoip_cn: "https://ghp.ci/https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-cn.srs".to_string(),
            geosite_ads: "https://ghp.ci/https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-category-ads-all.srs".to_string(),
        },
        "metacubex" => ResolvedRuleSetUrls {
            geosite_cn: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/cn.srs".to_string(),
            geosite_geolocation_not_cn: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/geolocation-!cn.srs".to_string(),
            geoip_cn: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geoip/cn.srs".to_string(),
            geosite_ads: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@sing/geo/geosite/category-ads-all.srs".to_string(),
        },
        _ => ResolvedRuleSetUrls {
            geosite_cn: "https://testingcf.jsdelivr.net/gh/SagerNet/sing-geosite@rule-set/geosite-cn.srs".to_string(),
            geosite_geolocation_not_cn: "https://testingcf.jsdelivr.net/gh/SagerNet/sing-geosite@rule-set/geosite-geolocation-!cn.srs".to_string(),
            geoip_cn: "https://testingcf.jsdelivr.net/gh/SagerNet/sing-geoip@rule-set/geoip-cn.srs".to_string(),
            geosite_ads: "https://testingcf.jsdelivr.net/gh/SagerNet/sing-geosite@rule-set/geosite-category-ads-all.srs".to_string(),
        },
    };

    if let Some(ref custom) = cfg.custom_rule_sets {
        if let Some(ref url) = custom.geosite_cn_url {
            let trimmed = url.trim();
            if !trimmed.is_empty() {
                urls.geosite_cn = trimmed.to_string();
            }
        }
        if let Some(ref url) = custom.geosite_geolocation_not_cn_url {
            let trimmed = url.trim();
            if !trimmed.is_empty() {
                urls.geosite_geolocation_not_cn = trimmed.to_string();
            }
        }
        if let Some(ref url) = custom.geoip_cn_url {
            let trimmed = url.trim();
            if !trimmed.is_empty() {
                urls.geoip_cn = trimmed.to_string();
            }
        }
        if let Some(ref url) = custom.geosite_ads_url {
            let trimmed = url.trim();
            if !trimmed.is_empty() {
                urls.geosite_ads = trimmed.to_string();
            }
        }
    }

    urls
}

pub fn resolve_download_detours(
    cfg: &SimpleRouteConfig,
    has_nodes: bool,
    target_proxy: &str,
) -> (&'static str, &'static str) {
    let can_proxy = has_nodes && target_proxy != "direct";
    if !can_proxy {
        return ("direct", "direct");
    }

    match cfg.rule_set_detour.trim().to_lowercase().as_str() {
        "proxy" => ("proxy", "proxy"),
        "direct" => ("direct", "direct"),
        _ => {
            let cn_detour = if cfg.rule_set_source.trim().eq_ignore_ascii_case("github") {
                "proxy"
            } else {
                "direct"
            };
            (cn_detour, "proxy")
        }
    }
}

/// 查询当前小白模式规则集的本地缓存与配置状态
pub fn get_rule_sets_status(route_cfg: &SimpleRouteConfig) -> Vec<RuleSetStatusInfo> {
    let urls = resolve_rule_set_urls(route_cfg);
    let mut targets = vec![
        ("geosite-cn", urls.geosite_cn),
        ("geosite-geolocation-!cn", urls.geosite_geolocation_not_cn),
        ("geoip-cn", urls.geoip_cn),
    ];
    if route_cfg.block_ads {
        targets.push(("geosite-category-ads-all", urls.geosite_ads));
    }

    targets
        .into_iter()
        .map(|(tag, url)| {
            let path_buf = crate::paths::AppPaths::get().ruleset_file_path(tag);
            let path_str = path_buf.to_string_lossy().replace('\\', "/");
            let (cached, size, updated_at) = if path_buf.is_file() {
                if let Ok(meta) = std::fs::metadata(&path_buf) {
                    let len = meta.len();
                    if len > 0 {
                        let mtime = meta
                            .modified()
                            .ok()
                            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                            .map(|d| d.as_secs() as i64);
                        (true, Some(len), mtime)
                    } else {
                        (false, None, None)
                    }
                } else {
                    (false, None, None)
                }
            } else {
                (false, None, None)
            };

            RuleSetStatusInfo {
                tag: tag.to_string(),
                cached,
                size,
                updated_at,
                path: path_str,
                url,
            }
        })
        .collect()
}

/// 根据本地缓存状态与用户偏好，组装单个 rule_set 项（优先 local，缺失降级 remote）
pub fn build_rule_set_entry(
    tag: &str,
    url: &str,
    detour: &str,
    use_local_rule_sets: bool,
) -> serde_json::Value {
    if use_local_rule_sets {
        let path_buf = crate::paths::AppPaths::get().ruleset_file_path(tag);
        if path_buf.is_file() {
            if let Ok(meta) = std::fs::metadata(&path_buf) {
                if meta.len() > 0 {
                    let path_str = path_buf.to_string_lossy().replace('\\', "/");
                    return json!({
                        "tag": tag,
                        "type": "local",
                        "format": "binary",
                        "path": path_str
                    });
                }
            }
        }
    }

    json!({
        "tag": tag,
        "type": "remote",
        "format": "binary",
        "url": url,
        "download_detour": detour,
        "update_interval": "1d"
    })
}

/// 下载并缓存单个规则集二进制文件到本地 `<data_dir>/rulesets/<tag>.srs`
pub async fn download_and_cache_rule_set(
    tag: &str,
    url: &str,
    proxy_port: Option<u16>,
) -> Result<RuleSetStatusInfo, String> {
    let paths = crate::paths::AppPaths::get();
    let rulesets_dir = paths.rulesets_dir();
    let _ = std::fs::create_dir_all(&rulesets_dir);

    let target_path = paths.ruleset_file_path(tag);
    let tmp_path = rulesets_dir.join(format!("{}.srs.tmp", tag));

    // 1. 发起下载，优先直连，失败且配置了 proxy_port 时尝试本地代理重试
    let bytes = fetch_rule_set_bytes(url, proxy_port).await?;

    // 2. 校验文件基本尺寸与内容
    if bytes.len() < 512 {
        return Err(format!(
            "下载的规则集 {} 文件过小 ({} 字节)，可能非有效 SRS 二进制",
            tag,
            bytes.len()
        ));
    }
    let head = &bytes[..bytes.len().min(128)];
    let head_str = String::from_utf8_lossy(head).to_lowercase();
    if head_str.contains("<!doctype") || head_str.contains("<html") || head_str.contains("<head") {
        return Err(format!(
            "下载的规则集 {} 返回了 HTML 网页而非有效二进制",
            tag
        ));
    }

    // 3. 写入临时文件并原子替换
    if let Err(e) = std::fs::write(&tmp_path, &bytes) {
        return Err(format!("写入临时文件失败: {}", e));
    }

    if let Err(e) = std::fs::rename(&tmp_path, &target_path) {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(format!("替换目标规则集文件失败: {}", e));
    }

    let file_size = bytes.len() as u64;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .ok();

    Ok(RuleSetStatusInfo {
        tag: tag.to_string(),
        cached: true,
        size: Some(file_size),
        updated_at: now,
        path: target_path.to_string_lossy().replace('\\', "/"),
        url: url.to_string(),
    })
}

async fn fetch_rule_set_bytes(url: &str, proxy_port: Option<u16>) -> Result<Vec<u8>, String> {
    match fetch_rule_set_http_once(url, None).await {
        Ok(bytes) => Ok(bytes),
        Err(direct_err) => {
            if let Some(port) = proxy_port {
                let proxy_url = format!("http://127.0.0.1:{}", port);
                fetch_rule_set_http_once(url, Some(&proxy_url))
                    .await
                    .map_err(|proxy_err| {
                        format!("直连下载失败 ({})，代理下载亦失败 ({})", direct_err, proxy_err)
                    })
            } else {
                Err(format!("直连下载失败: {}", direct_err))
            }
        }
    }
}

async fn fetch_rule_set_http_once(url: &str, proxy_url: Option<&str>) -> Result<Vec<u8>, String> {
    let mut builder = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .redirect(reqwest::redirect::Policy::limited(10))
        .timeout(std::time::Duration::from_secs(15));

    if let Some(proxy) = proxy_url {
        let p = reqwest::Proxy::all(proxy).map_err(|e| format!("代理地址无效: {}", e))?;
        builder = builder.proxy(p);
    }

    let client = builder.build().map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;
    let resp = client.get(url).send().await.map_err(|e| format!("HTTP 请求失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP 状态码异常: {}", resp.status()));
    }

    let bytes = resp.bytes().await.map_err(|e| format!("读取响应数据失败: {}", e))?;
    Ok(bytes.to_vec())
}

/// 批量下载当前路由配置涉及的所有规则集
pub async fn download_and_cache_all_rule_sets(
    route_cfg: &SimpleRouteConfig,
    proxy_port: Option<u16>,
) -> Vec<Result<RuleSetStatusInfo, String>> {
    let urls = resolve_rule_set_urls(route_cfg);
    let mut targets = vec![
        ("geosite-cn", urls.geosite_cn),
        ("geosite-geolocation-!cn", urls.geosite_geolocation_not_cn),
        ("geoip-cn", urls.geoip_cn),
    ];
    if route_cfg.block_ads {
        targets.push(("geosite-category-ads-all", urls.geosite_ads));
    }

    let mut results = Vec::with_capacity(targets.len());
    for (tag, url) in targets {
        let res = download_and_cache_rule_set(tag, &url, proxy_port).await;
        results.push(res);
    }
    results
}


fn default_log_level() -> String {
    "info".to_string()
}

fn default_true() -> bool {
    true
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct SimpleLogConfig {
    #[serde(default = "default_log_level")]
    pub level: String, // "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "panic"
    #[serde(default = "default_true")]
    pub timestamp: bool,
    #[serde(default)]
    pub disabled: bool,
    #[serde(default)]
    pub output: String,
}

impl Default for SimpleLogConfig {
    fn default() -> Self {
        Self {
            level: "info".to_string(),
            timestamp: true,
            disabled: false,
            output: String::new(),
        }
    }
}

#[derive(Clone, Serialize, Deserialize, Debug, Default)]
pub struct SimpleConfig {
    #[serde(default)]
    pub log: SimpleLogConfig,
    pub dns: SimpleDnsConfig,
    pub inbound: SimpleInboundConfig,
    pub route: SimpleRouteConfig,
}

pub fn get_saved_simple_config(conn: &Connection) -> SimpleConfig {
    if let Ok(Some(json_str)) = db::get_setting(conn, "simple_config")
        && let Ok(cfg) = serde_json::from_str::<SimpleConfig>(&json_str)
    {
        return cfg;
    }
    SimpleConfig::default()
}

pub fn save_simple_config(conn: &Connection, cfg: &SimpleConfig) -> Result<()> {
    let json_str = serde_json::to_string(cfg)?;
    db::update_setting(conn, "simple_config", &json_str)?;
    Ok(())
}

fn apply_dns_detour(obj: &mut Value, detour: Option<&str>) {
    if let Some(d) = detour {
        let trimmed = d.trim();
        if !trimmed.is_empty() && trimmed != "direct" {
            obj["detour"] = json!(trimmed);
        }
    }
}

pub fn build_dns_server(tag: &str, address_str: &str, detour: Option<&str>) -> Value {
    let s = address_str.trim();
    if s.eq_ignore_ascii_case("fakeip") {
        return json!({
            "tag": tag,
            "type": "fakeip",
            "inet4_range": "198.18.0.0/15"
        });
    }
    if s == "local" {
        let mut obj = json!({
            "tag": tag,
            "type": "local"
        });
        apply_dns_detour(&mut obj, detour);
        return obj;
    }

    if let Ok(parsed_url) = url::Url::parse(s) {
        let scheme = parsed_url.scheme();
        let host = parsed_url.host_str().unwrap_or(s);
        let port = parsed_url.port();
        let path = parsed_url.path();

        match scheme {
            "https" | "http" => {
                let mut obj = json!({
                    "tag": tag,
                    "type": "https",
                    "server": host
                });
                if let Some(p) = port {
                    obj["server_port"] = json!(p);
                }
                if !path.is_empty() && path != "/" {
                    obj["path"] = json!(path);
                }
                apply_dns_detour(&mut obj, detour);
                return obj;
            }
            "h3" => {
                let mut obj = json!({
                    "tag": tag,
                    "type": "h3",
                    "server": host
                });
                if let Some(p) = port {
                    obj["server_port"] = json!(p);
                }
                if !path.is_empty() && path != "/" {
                    obj["path"] = json!(path);
                }
                apply_dns_detour(&mut obj, detour);
                return obj;
            }
            "tls" => {
                let mut obj = json!({
                    "tag": tag,
                    "type": "tls",
                    "server": host
                });
                if let Some(p) = port {
                    obj["server_port"] = json!(p);
                }
                apply_dns_detour(&mut obj, detour);
                return obj;
            }
            "tcp" => {
                let mut obj = json!({
                    "tag": tag,
                    "type": "tcp",
                    "server": host
                });
                if let Some(p) = port {
                    obj["server_port"] = json!(p);
                }
                apply_dns_detour(&mut obj, detour);
                return obj;
            }
            "quic" => {
                let mut obj = json!({
                    "tag": tag,
                    "type": "quic",
                    "server": host
                });
                if let Some(p) = port {
                    obj["server_port"] = json!(p);
                }
                apply_dns_detour(&mut obj, detour);
                return obj;
            }
            "udp" => {
                let mut obj = json!({
                    "tag": tag,
                    "type": "udp",
                    "server": host
                });
                if let Some(p) = port {
                    obj["server_port"] = json!(p);
                }
                apply_dns_detour(&mut obj, detour);
                return obj;
            }
            _ => {}
        }
    }

    let (host, port) = if let Some((h, p_str)) = s.split_once(':') {
        if !h.contains(':') {
            (h, p_str.parse::<u16>().ok())
        } else {
            (s, None)
        }
    } else {
        (s, None)
    };

    let mut obj = json!({
        "tag": tag,
        "type": "udp",
        "server": host
    });
    if let Some(p) = port {
        obj["server_port"] = json!(p);
    }
    apply_dns_detour(&mut obj, detour);
    obj
}

pub fn generate_simple_singbox_config(conn: &Connection, cfg: &SimpleConfig) -> Result<Value> {
    // 1. Log section
    let log_level = match cfg.log.level.trim().to_lowercase().as_str() {
        "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "panic" => {
            cfg.log.level.trim().to_lowercase()
        }
        _ => "info".to_string(),
    };
    let mut log_map = serde_json::Map::new();
    log_map.insert("level".to_string(), json!(log_level));
    log_map.insert("timestamp".to_string(), json!(cfg.log.timestamp));
    if cfg.log.disabled {
        log_map.insert("disabled".to_string(), json!(true));
    }
    let output_trimmed = cfg.log.output.trim();
    if !output_trimmed.is_empty() {
        log_map.insert("output".to_string(), json!(output_trimmed));
    }
    let log_val = Value::Object(log_map);

    // 2. DNS section
    let is_fakeip_mode = cfg.dns.mode == "preset_fakeip"
        || cfg.dns.mode == "fakeip"
        || cfg.dns.foreign_dns.trim().eq_ignore_ascii_case("fakeip");

    let domestic_dns = if cfg.dns.domestic_dns.trim().is_empty() {
        "223.5.5.5".to_string()
    } else {
        cfg.dns.domestic_dns.trim().to_string()
    };

    let foreign_dns = if cfg.dns.foreign_dns.trim().is_empty() {
        if is_fakeip_mode {
            "fakeip".to_string()
        } else {
            "https://1.1.1.1/dns-query".to_string()
        }
    } else {
        cfg.dns.foreign_dns.trim().to_string()
    };

    // 3. Outbounds resolution (needed early to decide DNS detour and fallback)
    let nodes = db::get_nodes(conn)?;
    let mut proxy_node_tags = Vec::new();
    let mut node_outbounds = Vec::new();

    for node in nodes {
        if node.enabled {
            proxy_node_tags.push(node.tag.clone());
            if let Ok(mut val) = serde_json::from_str::<Value>(&node.raw_json)
                && let Some(obj) = val.as_object_mut()
            {
                obj.insert("tag".to_string(), Value::String(node.tag.clone()));
                generator::sanitize_outbound_value(&mut val);
                node_outbounds.push(val);
            }
        }
    }

    let has_nodes = !proxy_node_tags.is_empty();

    // Determine target proxy outbound
    let target_proxy = if cfg.route.default_outbound == "direct" || !has_nodes {
        "direct".to_string()
    } else if cfg.route.default_outbound == "proxy" {
        "proxy".to_string()
    } else if cfg.route.default_outbound == "AUTO-Test" {
        "AUTO-Test".to_string()
    } else if proxy_node_tags.contains(&cfg.route.default_outbound) {
        cfg.route.default_outbound.clone()
    } else {
        "AUTO-Test".to_string()
    };

    let dns_servers = if is_fakeip_mode {
        vec![
            build_dns_server("dns_local", &domestic_dns, None),
            build_dns_server("dns_fakeip", "fakeip", None),
        ]
    } else {
        // If proxy nodes exist and target_proxy is not direct, route foreign DNS through proxy.
        // Otherwise route foreign DNS directly without proxy detour.
        let remote_dns_detour = if has_nodes && target_proxy != "direct" {
            Some("proxy")
        } else {
            None
        };
        vec![
            build_dns_server("dns_local", &domestic_dns, None),
            build_dns_server("dns_remote", &foreign_dns, remote_dns_detour),
        ]
    };

    let mut dns_rules = Vec::new();

    if cfg.route.block_ads {
        dns_rules.push(json!({
            "rule_set": "geosite-category-ads-all",
            "action": "predefined",
            "rcode": "NOERROR"
        }));
    }

    let remote_dns_tag = if has_nodes && target_proxy != "direct" {
        if is_fakeip_mode {
            "dns_fakeip"
        } else {
            "dns_remote"
        }
    } else {
        "dns_local"
    };

    match cfg.route.mode.as_str() {
        "smart" => {
            dns_rules.push(json!({
                "rule_set": "geosite-cn",
                "server": "dns_local"
            }));
            dns_rules.push(json!({
                "rule_set": "geosite-geolocation-!cn",
                "server": remote_dns_tag
            }));
        }
        "gfw" => {
            dns_rules.push(json!({
                "rule_set": "geosite-geolocation-!cn",
                "server": remote_dns_tag
            }));
        }
        "global" => {
            dns_rules.push(json!({
                "server": remote_dns_tag
            }));
        }
        _ => {}
    }

    // Simple Mode is strictly IPv4-only to avoid any dual-stack IPv6 DNS/routing leaks or blackholes
    let dns_val = json!({
        "servers": dns_servers,
        "rules": dns_rules,
        "final": "dns_local",
        "strategy": "ipv4_only",
        "independent_cache": true
    });

    // 4. Inbounds section
    let inbounds_val = match cfg.inbound.inbound_type.as_str() {
        "tun" => {
            let platform = crate::platform::current_platform();
            let effective_stack = platform.effective_tun_stack(cfg.inbound.tun_stack.as_str());
            let iface_name = platform.default_tun_interface_name();
            let strict_route = platform.default_tun_strict_route();
            let mut tun_obj = json!({
                "type": "tun",
                "tag": "tun-in",
                "address": ["172.19.0.1/30"],
                "auto_route": cfg.inbound.tun_auto_route,
                "strict_route": strict_route,
                "stack": effective_stack
            });
            if !iface_name.is_empty() {
                tun_obj["interface_name"] = json!(iface_name);
            }
            json!([tun_obj])
        }
        _ => {
            // Mixed port HTTP / SOCKS5
            let listen_addr = if cfg.inbound.allow_lan {
                "0.0.0.0"
            } else {
                "127.0.0.1"
            };
            json!([
                {
                    "type": "mixed",
                    "tag": "mixed-in",
                    "listen": listen_addr,
                    "listen_port": cfg.inbound.mixed_port
                }
            ])
        }
    };

    // 5. Outbounds section
    let mut selector_outbounds = vec!["direct".to_string()];
    if has_nodes {
        selector_outbounds.insert(0, "AUTO-Test".to_string());
        selector_outbounds.extend(proxy_node_tags.clone());
    }

    let mut selector_val = json!({
        "type": "selector",
        "tag": "proxy",
        "outbounds": selector_outbounds
    });
    if cfg.route.default_outbound == "direct" {
        selector_val["default"] = json!("direct");
    } else if proxy_node_tags.contains(&cfg.route.default_outbound) {
        selector_val["default"] = json!(cfg.route.default_outbound);
    } else if has_nodes && cfg.route.default_outbound == "AUTO-Test" {
        selector_val["default"] = json!("AUTO-Test");
    }

    let mut outbounds_val = vec![
        json!({
            "type": "direct",
            "tag": "direct"
        }),
        json!({
            "type": "block",
            "tag": "block"
        }),
        selector_val,
    ];

    if has_nodes {
        outbounds_val.push(json!({
            "type": "urltest",
            "tag": "AUTO-Test",
            "url": "http://cp.cloudflare.com/generate_204",
            "interval": "3m",
            "tolerance": 50,
            "outbounds": proxy_node_tags.clone()
        }));
    }

    outbounds_val.extend(node_outbounds);

    // 6. Route section
    let mut route_rules = vec![
        json!({
            "action": "sniff"
        }),
        json!({
            "protocol": "dns",
            "action": "hijack-dns"
        }),
        json!({
            "port": 53,
            "action": "hijack-dns"
        }),
    ];

    if cfg.route.block_ads {
        route_rules.push(json!({
            "rule_set": "geosite-category-ads-all",
            "outbound": "block"
        }));
    }

    if cfg.route.bypass_lan {
        route_rules.push(json!({
            "ip_is_private": true,
            "outbound": "direct"
        }));
    }

    match cfg.route.mode.as_str() {
        "smart" => {
            route_rules.push(json!({
                "rule_set": "geosite-cn",
                "outbound": "direct"
            }));
            route_rules.push(json!({
                "rule_set": "geoip-cn",
                "outbound": "direct"
            }));
            route_rules.push(json!({
                "rule_set": "geosite-geolocation-!cn",
                "outbound": &target_proxy
            }));
            route_rules.push(json!({
                "outbound": &target_proxy
            }));
        }
        "gfw" => {
            route_rules.push(json!({
                "rule_set": "geosite-geolocation-!cn",
                "outbound": &target_proxy
            }));
            route_rules.push(json!({
                "outbound": "direct"
            }));
        }
        _ => {
            route_rules.push(json!({
                "outbound": &target_proxy
            }));
        }
    }

    let (cn_detour, remote_detour) = resolve_download_detours(&cfg.route, has_nodes, &target_proxy);
    let rule_set_urls = resolve_rule_set_urls(&cfg.route);
    let use_local = cfg.route.use_local_rule_sets;

    let mut rule_sets = vec![
        build_rule_set_entry("geosite-cn", &rule_set_urls.geosite_cn, cn_detour, use_local),
        build_rule_set_entry(
            "geosite-geolocation-!cn",
            &rule_set_urls.geosite_geolocation_not_cn,
            remote_detour,
            use_local,
        ),
        build_rule_set_entry("geoip-cn", &rule_set_urls.geoip_cn, cn_detour, use_local),
    ];

    if cfg.route.block_ads {
        rule_sets.push(build_rule_set_entry(
            "geosite-category-ads-all",
            &rule_set_urls.geosite_ads,
            remote_detour,
            use_local,
        ));
    }

    let route_val = json!({
        "auto_detect_interface": true,
        "find_process": cfg.inbound.inbound_type == "tun",
        "default_domain_resolver": "dns_local",
        "rules": route_rules,
        "rule_set": rule_sets,
        "final": target_proxy
    });

    let experimental_val = json!({});

    Ok(json!({
        "log": log_val,
        "dns": dns_val,
        "inbounds": inbounds_val,
        "outbounds": outbounds_val,
        "route": route_val,
        "experimental": experimental_val
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_dns_server_types() {
        let local_udp = build_dns_server("dns_local", "223.5.5.5", Some("direct"));
        assert_eq!(local_udp["type"], "udp");
        assert_eq!(local_udp["server"], "223.5.5.5");
        // "direct" detour should be omitted to avoid sing-box "detour to empty direct outbound" error
        assert!(local_udp.get("detour").is_none());

        // FakeIP produces pure IPv4 range
        let fakeip = build_dns_server("dns_fakeip", "fakeip", None);
        assert_eq!(fakeip["type"], "fakeip");
        assert_eq!(fakeip["inet4_range"], "198.18.0.0/15");
        assert!(fakeip.get("inet6_range").is_none());

        let remote_doh = build_dns_server("dns_remote", "https://1.1.1.1/dns-query", Some("proxy"));
        assert_eq!(remote_doh["type"], "https");
        assert_eq!(remote_doh["server"], "1.1.1.1");
        assert_eq!(remote_doh["path"], "/dns-query");
        assert_eq!(remote_doh["detour"], "proxy");

        let remote_dot = build_dns_server("dns_remote", "tls://8.8.8.8:853", Some("proxy"));
        assert_eq!(remote_dot["type"], "tls");
        assert_eq!(remote_dot["server"], "8.8.8.8");
        assert_eq!(remote_dot["server_port"], 853);

        let system_local = build_dns_server("dns_local", "local", Some("direct"));
        assert_eq!(system_local["type"], "local");
        assert!(system_local.get("detour").is_none());
    }

    #[test]
    fn test_generate_simple_singbox_config_structure() {
        let conn = crate::db::init_db(":memory:").unwrap();
        let cfg = SimpleConfig::default();
        assert_eq!(cfg.dns.mode, "preset_fakeip");

        let generated_cfg = generate_simple_singbox_config(&conn, &cfg).unwrap();

        assert!(generated_cfg.get("log").is_some());
        assert!(generated_cfg.get("dns").is_some());
        assert!(generated_cfg.get("inbounds").is_some());
        assert!(generated_cfg.get("outbounds").is_some());
        assert!(generated_cfg.get("route").is_some());

        // Strategy must be ipv4_only for robust, reliable operation without dual-stack leaks
        assert_eq!(
            generated_cfg
                .get("dns")
                .unwrap()
                .get("strategy")
                .unwrap()
                .as_str(),
            Some("ipv4_only")
        );

        // TUN address must only contain IPv4 address
        let inbounds = generated_cfg.get("inbounds").unwrap().as_array().unwrap();
        let tun_addr = inbounds[0].get("address").unwrap().as_array().unwrap();
        assert_eq!(tun_addr.len(), 1);
        assert_eq!(tun_addr[0].as_str(), Some("172.19.0.1/30"));

        // Check DNS servers in default preset_fakeip mode
        let dns_servers = generated_cfg
            .get("dns")
            .unwrap()
            .get("servers")
            .unwrap()
            .as_array()
            .unwrap();
        assert!(
            dns_servers
                .iter()
                .any(|s| s.get("tag").unwrap().as_str() == Some("dns_local"))
        );
        let fakeip_srv = dns_servers
            .iter()
            .find(|s| s.get("tag").unwrap().as_str() == Some("dns_fakeip"))
            .unwrap();
        assert!(fakeip_srv.get("inet6_range").is_none());

        // Check Outbounds when no nodes are in DB (clean direct mode, no AUTO-Test probing)
        let outbounds = generated_cfg.get("outbounds").unwrap().as_array().unwrap();
        assert!(
            outbounds
                .iter()
                .any(|o| o.get("tag").unwrap().as_str() == Some("proxy"))
        );
        assert!(
            outbounds
                .iter()
                .any(|o| o.get("tag").unwrap().as_str() == Some("direct"))
        );
        assert!(
            !outbounds
                .iter()
                .any(|o| o.get("tag").unwrap().as_str() == Some("AUTO-Test"))
        );

        // Now add a proxy node to DB and verify AUTO-Test is properly created and dns_fakeip is used
        crate::db::save_node(
            &conn,
            None,
            "HK-Node-01",
            "vless",
            "1.2.3.4",
            443,
            &serde_json::json!({
                "type": "vless",
                "tag": "HK-Node-01",
                "server": "1.2.3.4",
                "server_port": 443,
                "uuid": "00000000-0000-0000-0000-000000000000"
            })
            .to_string(),
            true,
            true,
        )
        .unwrap();

        let generated_with_nodes = generate_simple_singbox_config(&conn, &cfg).unwrap();
        let outbounds_with_nodes = generated_with_nodes
            .get("outbounds")
            .unwrap()
            .as_array()
            .unwrap();
        assert!(
            outbounds_with_nodes
                .iter()
                .any(|o| o.get("tag").unwrap().as_str() == Some("AUTO-Test"))
        );
        assert!(
            outbounds_with_nodes
                .iter()
                .any(|o| o.get("tag").unwrap().as_str() == Some("HK-Node-01"))
        );

        // Check DNS rules route foreign domains to dns_fakeip
        let dns_rules = generated_with_nodes
            .get("dns")
            .unwrap()
            .get("rules")
            .unwrap()
            .as_array()
            .unwrap();
        let foreign_dns_rule = dns_rules.iter().find(|r| {
            r.get("rule_set").and_then(|rs| rs.as_str()) == Some("geosite-geolocation-!cn")
        });
        assert!(foreign_dns_rule.is_some());
        assert_eq!(
            foreign_dns_rule
                .unwrap()
                .get("server")
                .and_then(|s| s.as_str()),
            Some("dns_fakeip")
        );

        // Check foreign rule_set download_detour routes via proxy when proxy is available
        let rule_sets = generated_with_nodes
            .get("route")
            .unwrap()
            .get("rule_set")
            .unwrap()
            .as_array()
            .unwrap();
        let foreign_rs = rule_sets
            .iter()
            .find(|rs| rs.get("tag").and_then(|t| t.as_str()) == Some("geosite-geolocation-!cn"))
            .unwrap();
        assert_eq!(
            foreign_rs.get("download_detour").and_then(|d| d.as_str()),
            Some("proxy")
        );
        let cn_rs = rule_sets
            .iter()
            .find(|rs| rs.get("tag").and_then(|t| t.as_str()) == Some("geosite-cn"))
            .unwrap();
        assert_eq!(
            cn_rs.get("download_detour").and_then(|d| d.as_str()),
            Some("direct")
        );
    }

    #[test]
    fn test_simple_config_preset_domestic_foreign_mode() {
        let conn = crate::db::init_db(":memory:").unwrap();
        crate::db::save_node(
            &conn,
            None,
            "HK-01",
            "vless",
            "1.2.3.4",
            443,
            &serde_json::json!({
                "type": "vless",
                "tag": "HK-01",
                "server": "1.2.3.4",
                "server_port": 443,
                "uuid": "00000000-0000-0000-0000-000000000000"
            })
            .to_string(),
            true,
            true,
        )
        .unwrap();

        let mut cfg = SimpleConfig::default();
        cfg.dns.mode = "preset_domestic_foreign".to_string();
        cfg.dns.domestic_dns = "223.5.5.5".to_string();
        cfg.dns.foreign_dns = "https://1.1.1.1/dns-query".to_string();

        let generated_cfg = generate_simple_singbox_config(&conn, &cfg).unwrap();
        let dns_servers = generated_cfg
            .get("dns")
            .unwrap()
            .get("servers")
            .unwrap()
            .as_array()
            .unwrap();
        assert!(
            dns_servers
                .iter()
                .any(|s| s.get("tag").unwrap().as_str() == Some("dns_local"))
        );
        assert!(
            dns_servers
                .iter()
                .any(|s| s.get("tag").unwrap().as_str() == Some("dns_remote"))
        );

        let dns_rules = generated_cfg
            .get("dns")
            .unwrap()
            .get("rules")
            .unwrap()
            .as_array()
            .unwrap();
        let foreign_dns_rule = dns_rules.iter().find(|r| {
            r.get("rule_set").and_then(|rs| rs.as_str()) == Some("geosite-geolocation-!cn")
        });
        assert_eq!(
            foreign_dns_rule
                .unwrap()
                .get("server")
                .and_then(|s| s.as_str()),
            Some("dns_remote")
        );
    }

    #[test]
    fn test_simple_config_tun_mode() {
        let conn = crate::db::init_db(":memory:").unwrap();
        let cfg = SimpleConfig::default();
        // Verify default inbound is TUN and default outbound is AUTO-Test
        assert_eq!(cfg.inbound.inbound_type, "tun");
        assert_eq!(cfg.route.default_outbound, "AUTO-Test");

        let generated_cfg = generate_simple_singbox_config(&conn, &cfg).unwrap();
        let inbounds = generated_cfg.get("inbounds").unwrap().as_array().unwrap();
        assert_eq!(inbounds[0].get("type").unwrap().as_str(), Some("tun"));
        assert_eq!(
            inbounds[0]
                .get("address")
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            1
        );

        // Test mixed mode fallback/customization
        let mut mixed_cfg = SimpleConfig::default();
        mixed_cfg.inbound.inbound_type = "mixed".to_string();
        let generated_mixed = generate_simple_singbox_config(&conn, &mixed_cfg).unwrap();
        let mixed_inbounds = generated_mixed.get("inbounds").unwrap().as_array().unwrap();
        assert_eq!(
            mixed_inbounds[0].get("type").unwrap().as_str(),
            Some("mixed")
        );
    }

    #[test]
    fn test_generated_config_passes_singbox_check() {
        let conn = crate::db::init_db(":memory:").unwrap();
        let cfg = SimpleConfig::default();
        let generated_cfg = generate_simple_singbox_config(&conn, &cfg).unwrap();

        let log = generated_cfg.get("log").cloned().unwrap_or(json!({}));
        let dns = generated_cfg.get("dns").cloned().unwrap_or(json!({}));
        let inbounds = generated_cfg.get("inbounds").cloned().unwrap_or(json!([]));
        let outbounds = generated_cfg.get("outbounds").cloned().unwrap_or(json!([]));
        let route = generated_cfg.get("route").cloned().unwrap_or(json!({}));
        let experimental = generated_cfg
            .get("experimental")
            .cloned()
            .unwrap_or(json!({}));

        let res = crate::web::config::validate_config_with_singbox(
            &log,
            &dns,
            &inbounds,
            &outbounds,
            &route,
            &experimental,
        );
        assert!(res.is_ok(), "Validation failed: {:?}", res.err());
    }

    #[test]
    fn test_simple_config_log_level_customization() {
        let conn = crate::db::init_db(":memory:").unwrap();
        let mut cfg = SimpleConfig::default();
        assert_eq!(cfg.log.level, "info");

        // Default should output info
        let generated_default = generate_simple_singbox_config(&conn, &cfg).unwrap();
        assert_eq!(generated_default["log"]["level"].as_str(), Some("info"));

        // Customized level warn
        cfg.log.level = "warn".to_string();
        let generated_warn = generate_simple_singbox_config(&conn, &cfg).unwrap();
        assert_eq!(generated_warn["log"]["level"].as_str(), Some("warn"));

        // Customized level error
        cfg.log.level = "error".to_string();
        let generated_error = generate_simple_singbox_config(&conn, &cfg).unwrap();
        assert_eq!(generated_error["log"]["level"].as_str(), Some("error"));

        // Case insensitivity & invalid fallback
        cfg.log.level = "DEBUG".to_string();
        let generated_debug = generate_simple_singbox_config(&conn, &cfg).unwrap();
        assert_eq!(generated_debug["log"]["level"].as_str(), Some("debug"));

        cfg.log.level = "invalid_level".to_string();
        let generated_invalid = generate_simple_singbox_config(&conn, &cfg).unwrap();
        assert_eq!(generated_invalid["log"]["level"].as_str(), Some("info"));

        // Timestamp, disabled, and output options
        cfg.log.timestamp = false;
        cfg.log.disabled = true;
        cfg.log.output = "sing-box.log".to_string();
        let generated_custom = generate_simple_singbox_config(&conn, &cfg).unwrap();
        assert_eq!(generated_custom["log"]["timestamp"].as_bool(), Some(false));
        assert_eq!(generated_custom["log"]["disabled"].as_bool(), Some(true));
        assert_eq!(
            generated_custom["log"]["output"].as_str(),
            Some("sing-box.log")
        );
    }

    #[test]
    fn test_resolve_rule_set_urls_and_sources() {
        let mut cfg = SimpleRouteConfig::default();
        assert_eq!(cfg.rule_set_source, "jsdelivr");
        let default_urls = resolve_rule_set_urls(&cfg);
        assert!(default_urls.geosite_cn.contains("testingcf.jsdelivr.net"));
        assert!(default_urls.geosite_geolocation_not_cn.contains("geosite-geolocation-!cn.srs"));

        // GitHub raw
        cfg.rule_set_source = "github".to_string();
        let gh_urls = resolve_rule_set_urls(&cfg);
        assert!(gh_urls.geosite_cn.contains("raw.githubusercontent.com"));

        // ghproxy
        cfg.rule_set_source = "ghproxy".to_string();
        let proxy_urls = resolve_rule_set_urls(&cfg);
        assert!(proxy_urls.geosite_cn.contains("ghp.ci"));

        // metacubex
        cfg.rule_set_source = "metacubex".to_string();
        let meta_urls = resolve_rule_set_urls(&cfg);
        assert!(meta_urls.geosite_cn.contains("MetaCubeX/meta-rules-dat"));

        // Custom override single field
        cfg.rule_set_source = "jsdelivr".to_string();
        cfg.custom_rule_sets = Some(SimpleCustomRuleSets {
            geosite_cn_url: Some("https://my-internal-srs.lan/geosite-cn.srs".to_string()),
            geosite_geolocation_not_cn_url: None,
            geoip_cn_url: None,
            geosite_ads_url: None,
        });
        let custom_urls = resolve_rule_set_urls(&cfg);
        assert_eq!(custom_urls.geosite_cn, "https://my-internal-srs.lan/geosite-cn.srs");
        assert!(custom_urls.geoip_cn.contains("testingcf.jsdelivr.net"));
    }

    #[test]
    fn test_rule_set_detour_modes_and_custom_override() {
        let conn = crate::db::init_db(":memory:").unwrap();
        crate::db::save_node(
            &conn,
            None,
            "HK-01",
            "vless",
            "1.2.3.4",
            443,
            &serde_json::json!({
                "type": "vless",
                "tag": "HK-01",
                "server": "1.2.3.4",
                "server_port": 443,
                "uuid": "00000000-0000-0000-0000-000000000000"
            })
            .to_string(),
            true,
            true,
        )
        .unwrap();

        let mut cfg = SimpleConfig::default();
        // 1. Force proxy for all rule_sets
        cfg.route.rule_set_detour = "proxy".to_string();
        let gen_proxy = generate_simple_singbox_config(&conn, &cfg).unwrap();
        let rule_sets = gen_proxy["route"]["rule_set"].as_array().unwrap();
        for rs in rule_sets {
            assert_eq!(rs["download_detour"].as_str(), Some("proxy"));
        }

        // 2. Force direct for all rule_sets
        cfg.route.rule_set_detour = "direct".to_string();
        let gen_direct = generate_simple_singbox_config(&conn, &cfg).unwrap();
        let rule_sets = gen_direct["route"]["rule_set"].as_array().unwrap();
        for rs in rule_sets {
            assert_eq!(rs["download_detour"].as_str(), Some("direct"));
        }

        // 3. Auto mode + github: cn rules auto detour via proxy to prevent direct timeout
        cfg.route.rule_set_detour = "auto".to_string();
        cfg.route.rule_set_source = "github".to_string();
        let gen_gh = generate_simple_singbox_config(&conn, &cfg).unwrap();
        let rule_sets = gen_gh["route"]["rule_set"].as_array().unwrap();
        let cn_rs = rule_sets.iter().find(|rs| rs["tag"].as_str() == Some("geosite-cn")).unwrap();
        assert_eq!(cn_rs["download_detour"].as_str(), Some("proxy"));
    }

    #[test]
    fn test_build_rule_set_entry_local_vs_remote() {
        let tag = "test-rule-tag";
        let url = "https://example.com/test.srs";
        let detour = "proxy";

        // 1. When local file does not exist, should produce remote
        let remote_entry = build_rule_set_entry(tag, url, detour, true);
        assert_eq!(remote_entry["type"].as_str(), Some("remote"));
        assert_eq!(remote_entry["url"].as_str(), Some(url));
        assert_eq!(remote_entry["download_detour"].as_str(), Some(detour));
        assert_eq!(remote_entry["format"].as_str(), Some("binary"));

        // 2. When local file exists and non-empty, and use_local_rule_sets is true, produce local
        let file_path = crate::paths::AppPaths::get().ruleset_file_path(tag);
        let _ = std::fs::create_dir_all(crate::paths::AppPaths::get().rulesets_dir());
        std::fs::write(&file_path, b"test-binary-srs-data").unwrap();

        let local_entry = build_rule_set_entry(tag, url, detour, true);
        assert_eq!(local_entry["type"].as_str(), Some("local"));
        assert_eq!(local_entry["tag"].as_str(), Some(tag));
        assert_eq!(local_entry["format"].as_str(), Some("binary"));
        assert!(local_entry.get("url").is_none());
        assert!(local_entry["path"].as_str().unwrap().contains("test-rule-tag.srs"));

        // 3. When use_local_rule_sets is false, even if local file exists, produce remote
        let forced_remote_entry = build_rule_set_entry(tag, url, detour, false);
        assert_eq!(forced_remote_entry["type"].as_str(), Some("remote"));
        assert_eq!(forced_remote_entry["url"].as_str(), Some(url));

        let _ = std::fs::remove_file(&file_path);
    }

    #[test]
    fn test_get_rule_sets_status_and_defaults() {
        let mut cfg = SimpleRouteConfig::default();
        assert!(cfg.use_local_rule_sets);

        // Default has block_ads: true, so 4 rule sets
        let statuses = get_rule_sets_status(&cfg);
        assert_eq!(statuses.len(), 4);
        assert_eq!(statuses[0].tag, "geosite-cn");
        assert_eq!(statuses[1].tag, "geosite-geolocation-!cn");
        assert_eq!(statuses[2].tag, "geoip-cn");
        assert_eq!(statuses[3].tag, "geosite-category-ads-all");

        // When block_ads is disabled, 3 rule sets
        cfg.block_ads = false;
        let statuses_no_ads = get_rule_sets_status(&cfg);
        assert_eq!(statuses_no_ads.len(), 3);
    }
}
