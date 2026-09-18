#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn line(target: &str, outbound: &str) -> String {
        format!(
            "INFO[0000] [42 10ms] router: {} using outbound/{}[{}] process_name=chrome.exe process_path=C:\\Program Files\\Google\\Chrome\\chrome.exe pid=1234",
            target, outbound, outbound
        )
    }

    #[test]
    fn parses_tcp_domain_and_process_metadata() {
        let parsed = parse_connection_line(&line("www.example.com:443 tcp", "proxy"))
            .expect("connection line should parse");

        assert_eq!(parsed.connection_id.as_deref(), Some("42"));
        assert_eq!(parsed.target, AuditTarget::Domain("www.example.com".into()));
        assert_eq!(parsed.port, 443);
        assert_eq!(parsed.protocol, NetworkProtocol::Tcp);
        assert_eq!(parsed.pid, Some(1234));
        assert_eq!(parsed.process_name.as_deref(), Some("chrome.exe"));
        assert_eq!(
            parsed.process_path.as_deref(),
            Some(r"C:\Program Files\Google\Chrome\chrome.exe")
        );
    }

    #[test]
    fn parses_udp_ip_and_direct_route() {
        let parsed = parse_connection_line(&line("1.2.3.4:53 udp", "direct"))
            .expect("connection line should parse");

        assert_eq!(parsed.target, AuditTarget::Ip("1.2.3.4".into()));
        assert_eq!(parsed.port, 53);
        assert_eq!(parsed.protocol, NetworkProtocol::Udp);
        assert_eq!(parsed.route_kind, RouteKind::Direct);
    }

    #[test]
    fn parses_standard_outbound_connection_log_shape() {
        let line =
            "INFO[0000] [88 5ms] outbound/proxy[HK-02]: outbound connection to www.example.com:443";
        let parsed = parse_connection_line(line).expect("standard outbound log should parse");
        assert_eq!(parsed.connection_id.as_deref(), Some("88"));
        assert_eq!(parsed.target, AuditTarget::Domain("www.example.com".into()));
        assert_eq!(parsed.port, 443);
        assert_eq!(parsed.protocol, NetworkProtocol::Tcp);
        assert_eq!(parsed.outbound_tag.as_deref(), Some("HK-02"));
    }

    #[test]
    fn ignores_non_connection_lines_and_does_not_guess_target() {
        assert!(parse_connection_line("INFO[0000] sing-box started").is_none());
        assert!(
            parse_connection_line(
                "INFO[0000] [42 10ms] router: connection using outbound/proxy[proxy]"
            )
            .is_none()
        );
    }

    #[test]
    fn deduplicates_same_process_target_port_protocol_and_records_route_change() {
        let mut store = ConnectionAuditStore::new();
        let first = store.ingest_line_at(
            &line("www.example.com:443 tcp", "proxy"),
            1_000,
            Some(&ResolvedOutbound {
                kind: RouteKind::Proxy,
                chain: vec!["proxy".into(), "HK-02".into()],
                final_node: Some("HK-02".into()),
            }),
        );
        assert!(first.is_some());
        assert_eq!(first.as_ref().map(|event| event.event_id), Some(1));
        assert!(
            store
                .ingest_line_at(
                    &line("www.example.com:443 tcp", "proxy"),
                    1_001,
                    Some(&ResolvedOutbound {
                        kind: RouteKind::Proxy,
                        chain: vec!["proxy".into(), "HK-02".into()],
                        final_node: Some("HK-02".into()),
                    }),
                )
                .is_none()
        );
        assert_eq!(store.snapshot_at(1_001).len(), 1);
        assert_eq!(store.snapshot_at(1_001)[0].occurrence_count, 2);
        assert_eq!(store.history_at(1_001)[0].occurrence_count, 2);

        let changed = store.ingest_line_at(
            &line("www.example.com:443 tcp", "proxy"),
            1_002,
            Some(&ResolvedOutbound {
                kind: RouteKind::Proxy,
                chain: vec!["proxy".into(), "JP-01".into()],
                final_node: Some("JP-01".into()),
            }),
        );
        assert!(changed.is_some());
        assert_eq!(changed.as_ref().map(|event| event.event_id), Some(2));
        assert_eq!(store.history_at(1_002).len(), 2);
    }

    #[test]
    fn key_includes_port_and_protocol() {
        let mut store = ConnectionAuditStore::new();
        for target in ["1.2.3.4:443 tcp", "1.2.3.4:443 udp", "1.2.3.4:80 tcp"] {
            assert!(
                store
                    .ingest_line_at(&line(target, "proxy"), 1_000, None)
                    .is_some(),
                "expected distinct {target}"
            );
        }
        assert_eq!(store.snapshot_at(1_000).len(), 3);
    }

    #[test]
    fn retention_is_clamped_and_expired_events_are_removed() {
        let mut store = ConnectionAuditStore::new();
        assert_eq!(store.retention_minutes(), DEFAULT_RETENTION_MINUTES);
        assert_eq!(store.set_retention_minutes(0), 10);
        assert_eq!(store.set_retention_minutes(999), MAX_RETENTION_MINUTES);
        assert_eq!(store.set_retention_minutes(10), 10);
        store.ingest_line_at(&line("1.2.3.4:443 tcp", "proxy"), 1_000, None);
        assert_eq!(store.snapshot_at(1_599).len(), 1);
        assert!(store.snapshot_at(1_600).is_empty());
    }

    #[test]
    fn clear_removes_current_and_history() {
        let mut store = ConnectionAuditStore::new();
        store.ingest_line_at(&line("1.2.3.4:443 tcp", "proxy"), 1_000, None);
        store.clear();
        assert!(store.snapshot_at(1_000).is_empty());
        assert!(store.history_at(1_000).is_empty());
    }

    #[test]
    fn event_cap_evicts_oldest_history() {
        let mut store = ConnectionAuditStore::new();
        for i in 0..20_001 {
            let target = format!("1.2.{}.{}:{} tcp", i / 256, i % 256, 1000 + i % 50000);
            store.ingest_line_at(&line(&target, "proxy"), 1_000, None);
        }
        assert_eq!(store.history_at(1_000).len(), 20_000);
        assert_eq!(store.snapshot_at(1_000).len(), 20_000);
    }

    #[test]
    fn event_expiry_duration_matches_minutes() {
        let mut store = ConnectionAuditStore::new();
        store.set_retention_minutes(20);
        store.ingest_line_at(&line("1.2.3.4:443 tcp", "proxy"), 1_000, None);
        assert_eq!(store.expiry_duration(), Duration::from_secs(20 * 60));
    }

    #[test]
    fn associates_process_path_logged_on_a_separate_connection_line() {
        let mut store = ConnectionAuditStore::new();
        assert!(
            store
                .remember_process_line(
                    "INFO[0000] [42 1ms] router: found process path: C:\\Apps\\demo.exe"
                )
                .is_some()
        );
        let parsed_line = "INFO[0000] [42 2ms] router: 1.2.3.4:443 tcp using outbound/proxy[proxy]";
        let event = store.ingest_line_at(parsed_line, 1_000, None).unwrap();
        assert_eq!(event.process_path.as_deref(), Some(r"C:\Apps\demo.exe"));
    }

    #[test]
    fn process_path_from_context_is_part_of_deduplication_key() {
        let mut store = ConnectionAuditStore::new();
        store.remember_process_line(
            "INFO[0000] [42 1ms] router: found process path: C:\\Apps\\one.exe",
        );
        let first = store
            .ingest_line_at(
                "INFO[0000] [42 2ms] router: 1.2.3.4:443 tcp using outbound/proxy[proxy]",
                1_000,
                None,
            )
            .expect("first process should be recorded");
        assert_eq!(first.process_path.as_deref(), Some(r"C:\Apps\one.exe"));

        store.remember_process_line(
            "INFO[0000] [43 1ms] router: found process path: C:\\Apps\\two.exe",
        );
        let second = store
            .ingest_line_at(
                "INFO[0000] [43 2ms] router: 1.2.3.4:443 tcp using outbound/proxy[proxy]",
                1_001,
                None,
            )
            .expect("different process path should not be merged");
        assert_eq!(second.process_path.as_deref(), Some(r"C:\Apps\two.exe"));
        assert_eq!(store.snapshot_at(1_001).len(), 2);
    }

    #[test]
    fn expires_process_context_and_does_not_keep_empty_connection_contexts() {
        let mut store = ConnectionAuditStore::new();
        store.remember_process_line_at(
            "INFO[0000] [42 1ms] router: found process path: C:\\Apps\\demo.exe",
            100,
        );
        assert_eq!(store.process_context.len(), 1);
        assert!(
            store
                .remember_process_line_at(
                    "INFO[0000] [43 1ms] router: 1.2.3.4:443 tcp using outbound/proxy[proxy]",
                    100,
                )
                .is_none()
        );
        assert_eq!(store.process_context.len(), 1);

        store.expire_at(100 + PROCESS_CONTEXT_TTL_SECONDS + 1);
        assert!(store.process_context.is_empty());
    }

    #[test]
    fn associates_matched_rule_and_sniffed_domain_with_connection() {
        let mut store = ConnectionAuditStore::new();
        store.remember_process_line("INFO[0000] [42 1ms] router: match[3] tag=YouTube => proxy");
        store.remember_process_line("INFO[0000] [42 2ms] router: sniffed domain: www.youtube.com");
        let event = store
            .ingest_line_at(
                "INFO[0000] [42 3ms] outbound/proxy[代理]: outbound connection to 142.250.1.1:443",
                1_000,
                Some(&ResolvedOutbound {
                    kind: RouteKind::Proxy,
                    chain: vec!["代理".into(), "HK-02".into()],
                    final_node: Some("HK-02".into()),
                }),
            )
            .expect("connection should be recorded");
        assert_eq!(event.target, AuditTarget::Domain("www.youtube.com".into()));
        assert_eq!(event.resolved_ip.as_deref(), Some("142.250.1.1"));
        assert_eq!(event.domain_source.as_deref(), Some("sniffed"));
        assert_eq!(event.domain_confidence.as_deref(), Some("high"));
        assert_eq!(event.matched_rule_index, Some(3));
        assert_eq!(event.matched_rule_tag.as_deref(), Some("YouTube"));
        assert_eq!(event.matched_rule_action.as_deref(), Some("proxy"));
        assert_eq!(
            event.matched_rule_summary.as_deref(),
            Some("tag=YouTube => proxy")
        );
        assert!(event.matched_rule_raw_line.is_some());
    }

    #[test]
    fn preserves_resolved_ip_for_a_domain_target_when_logged() {
        let mut store = ConnectionAuditStore::new();
        store.remember_process_line("INFO[0000] [42 1ms] router: resolved ip: 142.250.1.1");
        let event = store
            .ingest_line_at(
                "INFO[0000] [42 2ms] outbound/proxy[代理]: outbound connection to www.youtube.com:443",
                1_000,
                None,
            )
            .expect("connection should be recorded");
        assert_eq!(event.resolved_ip.as_deref(), Some("142.250.1.1"));
    }

    #[test]
    fn correlates_unique_dns_result_by_process_and_ip() {
        let mut store = ConnectionAuditStore::new();
        store.ingest_line_at(
            "INFO[0000] dns: query www.example.com -> 1.2.3.4 pid=123 process_path=C:\\Apps\\demo.exe",
            1_000,
            None,
        );
        let event = store
            .ingest_line_at(
                "INFO[0000] [42 3ms] router: 1.2.3.4:443 tcp using outbound/proxy[proxy] process_name=demo.exe process_path=C:\\Apps\\demo.exe pid=123",
                1_100,
                None,
            )
            .expect("connection should be recorded");
        assert_eq!(event.target, AuditTarget::Domain("www.example.com".into()));
        assert_eq!(event.resolved_ip.as_deref(), Some("1.2.3.4"));
        assert_eq!(event.domain_source.as_deref(), Some("dns"));
        assert_eq!(event.domain_confidence.as_deref(), Some("high"));
    }

    #[test]
    fn keeps_ip_and_marks_ambiguous_dns_candidates() {
        let mut store = ConnectionAuditStore::new();
        for domain in ["a.example.com", "b.example.com"] {
            store.ingest_line_at(
                &format!(
                    "INFO[0000] dns: query {domain} -> 1.2.3.4 pid=123 process_path=C:\\Apps\\demo.exe"
                ),
                1_000,
                None,
            );
        }
        let event = store
            .ingest_line_at(
                "INFO[0000] [42 3ms] router: 1.2.3.4:443 tcp using outbound/proxy[proxy] process_name=demo.exe process_path=C:\\Apps\\demo.exe pid=123",
                1_100,
                None,
            )
            .expect("connection should be recorded");
        assert_eq!(event.target, AuditTarget::Ip("1.2.3.4".into()));
        assert_eq!(event.domain_confidence.as_deref(), Some("ambiguous"));
        assert_eq!(
            event.domain_candidates,
            vec!["a.example.com", "b.example.com"]
        );
    }

    #[test]
    fn expands_nested_runtime_outbound_groups_to_final_node() {
        let proxies = serde_json::json!({
            "proxies": {
                "代理": {"type": "Selector", "now": "自动"},
                "自动": {"type": "URLTest", "now": "HK-02"},
                "HK-02": {"type": "VLESS"}
            }
        });
        let resolved = expand_outbound_chain(&proxies, "代理");
        assert_eq!(resolved.kind, RouteKind::Proxy);
        assert_eq!(resolved.chain, vec!["代理", "自动", "HK-02"]);
        assert_eq!(resolved.final_node.as_deref(), Some("HK-02"));
    }

    #[test]
    fn expands_direct_without_a_proxy_node() {
        let proxies = serde_json::json!({"proxies": {"direct": {"type": "Direct"}}});
        let resolved = expand_outbound_chain(&proxies, "direct");
        assert_eq!(resolved.kind, RouteKind::Direct);
        assert!(resolved.chain.is_empty());
        assert!(resolved.final_node.is_none());
    }

    #[test]
    fn leaves_final_node_unknown_when_runtime_group_is_missing() {
        let proxies = serde_json::json!({"proxies": {}});
        let resolved = expand_outbound_chain(&proxies, "代理");
        assert_eq!(resolved.kind, RouteKind::Proxy);
        assert_eq!(resolved.chain, vec!["代理"]);
        assert!(resolved.final_node.is_none());
    }

    #[test]
    fn disabled_store_does_not_record_lines() {
        let mut store = ConnectionAuditStore::new();
        store.set_enabled(false);
        assert!(
            store
                .ingest_line_at(&line("1.2.3.4:443 tcp", "proxy"), 1_000, None)
                .is_none()
        );
        assert!(store.snapshot_at(1_000).is_empty());
    }

    #[test]
    fn direct_connections_are_not_recorded() {
        let mut store = ConnectionAuditStore::new();
        assert!(
            store
                .ingest_line_at(&line("1.2.3.4:443 tcp", "direct"), 1_000, None)
                .is_none()
        );
        assert!(store.snapshot_at(1_000).is_empty());
        assert!(store.history_at(1_000).is_empty());
    }

    #[test]
    fn blocked_connections_are_not_recorded() {
        let mut store = ConnectionAuditStore::new();
        assert!(
            store
                .ingest_line_at(&line("1.2.3.4:443 tcp", "block"), 1_000, None)
                .is_none()
        );
        assert!(store.snapshot_at(1_000).is_empty());
        assert!(store.history_at(1_000).is_empty());
    }

    #[test]
    fn proxy_route_resolved_to_direct_is_not_recorded() {
        let mut store = ConnectionAuditStore::new();
        let resolved = ResolvedOutbound {
            kind: RouteKind::Direct,
            chain: Vec::new(),
            final_node: None,
        };
        assert!(
            store
                .ingest_line_at(&line("1.2.3.4:443 tcp", "proxy"), 1_000, Some(&resolved))
                .is_none()
        );
        assert!(store.snapshot_at(1_000).is_empty());
    }

    #[test]
    fn prunes_dead_processes_from_current_state_but_keeps_history() {
        let mut store = ConnectionAuditStore::new();
        store.ingest_line_at(&line("1.2.3.4:443 tcp", "proxy"), 1_000, None);
        store.prune_dead_processes(|_| false);
        assert!(store.snapshot_at(1_000).is_empty());
        assert_eq!(store.history_at(1_000).len(), 1);
    }
}
use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::hash::Hash;
use std::net::IpAddr;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub const DEFAULT_RETENTION_MINUTES: u64 = 20;
pub const MIN_RETENTION_MINUTES: u64 = 10;
pub const MAX_RETENTION_MINUTES: u64 = 20;
pub const MAX_AUDIT_EVENTS: usize = 20_000;
const PROCESS_CONTEXT_TTL_SECONDS: u64 = 5 * 60;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum RouteKind {
    Direct,
    Proxy,
    Blocked,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize)]
#[serde(tag = "type", content = "value")]
pub enum AuditTarget {
    Domain(String),
    Ip(String),
}

impl AuditTarget {
    fn display(&self) -> &str {
        match self {
            Self::Domain(value) | Self::Ip(value) => value,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum NetworkProtocol {
    Tcp,
    Udp,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ParsedConnection {
    pub connection_id: Option<String>,
    pub target: AuditTarget,
    pub port: u16,
    pub protocol: NetworkProtocol,
    pub pid: Option<u32>,
    pub process_name: Option<String>,
    pub process_path: Option<String>,
    pub route_kind: RouteKind,
    pub outbound_tag: Option<String>,
    pub raw_line: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResolvedOutbound {
    pub kind: RouteKind,
    pub chain: Vec<String>,
    pub final_node: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
struct AuditKey {
    pid: Option<u32>,
    process_path: Option<String>,
    target: AuditTarget,
    port: u16,
    protocol: NetworkProtocol,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct AuditEvent {
    /// Stable identifier for this distinct audit record during the current process lifetime.
    /// It deliberately does not change when `last_seen` or `connection_id` is refreshed.
    pub event_id: u64,
    pub first_seen: u64,
    pub last_seen: u64,
    pub occurrence_count: u64,
    pub connection_id: Option<String>,
    pub pid: Option<u32>,
    pub process_name: Option<String>,
    pub process_path: Option<String>,
    pub target: AuditTarget,
    pub target_display: String,
    pub resolved_ip: Option<String>,
    pub domain_source: Option<String>,
    pub domain_confidence: Option<String>,
    pub domain_candidates: Vec<String>,
    pub port: u16,
    pub protocol: NetworkProtocol,
    pub route_kind: RouteKind,
    pub outbound_tag: Option<String>,
    pub outbound_chain: Vec<String>,
    pub final_node: Option<String>,
    pub matched_rule_index: Option<u32>,
    pub matched_rule_tag: Option<String>,
    pub matched_rule_summary: Option<String>,
    pub matched_rule_action: Option<String>,
    pub matched_rule_raw_line: Option<String>,
    pub raw_line: String,
}

impl AuditEvent {
    fn fingerprint(&self) -> AuditFingerprint {
        AuditFingerprint {
            route_kind: self.route_kind,
            outbound_tag: self.outbound_tag.clone(),
            outbound_chain: self.outbound_chain.clone(),
            final_node: self.final_node.clone(),
            matched_rule_index: self.matched_rule_index,
            matched_rule_tag: self.matched_rule_tag.clone(),
            matched_rule_summary: self.matched_rule_summary.clone(),
            matched_rule_action: self.matched_rule_action.clone(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct AuditFingerprint {
    route_kind: RouteKind,
    outbound_tag: Option<String>,
    outbound_chain: Vec<String>,
    final_node: Option<String>,
    matched_rule_index: Option<u32>,
    matched_rule_tag: Option<String>,
    matched_rule_summary: Option<String>,
    matched_rule_action: Option<String>,
}

pub struct ConnectionAuditStore {
    enabled: bool,
    retention_minutes: u64,
    next_event_id: u64,
    current: HashMap<AuditKey, AuditEvent>,
    history: VecDeque<AuditEvent>,
    process_context: HashMap<String, ProcessContext>,
    dns_observations: VecDeque<DnsObservation>,
}

#[derive(Clone, Debug, Default)]
struct ProcessContext {
    last_seen: u64,
    name: Option<String>,
    path: Option<String>,
    sniffed_domain: Option<String>,
    resolved_ip: Option<String>,
    rule: Option<RuleContext>,
}

#[derive(Clone, Debug)]
struct RuleContext {
    index: Option<u32>,
    tag: Option<String>,
    summary: String,
    action: Option<String>,
    raw_line: String,
}

#[derive(Clone, Debug)]
struct DnsObservation {
    pid: Option<u32>,
    process_path: Option<String>,
    ip: String,
    domain: String,
    seen_at: u64,
}

impl ConnectionAuditStore {
    pub fn new() -> Self {
        Self {
            enabled: true,
            retention_minutes: DEFAULT_RETENTION_MINUTES,
            next_event_id: 1,
            current: HashMap::new(),
            history: VecDeque::new(),
            process_context: HashMap::new(),
            dns_observations: VecDeque::new(),
        }
    }

    pub fn retention_minutes(&self) -> u64 {
        self.retention_minutes
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled
    }

    pub fn set_enabled(&mut self, enabled: bool) {
        self.enabled = enabled;
        if !enabled {
            self.clear();
        }
    }

    pub fn set_retention_minutes(&mut self, minutes: u64) -> u64 {
        self.retention_minutes = minutes.clamp(MIN_RETENTION_MINUTES, MAX_RETENTION_MINUTES);
        self.retention_minutes
    }

    pub fn expiry_duration(&self) -> Duration {
        Duration::from_secs(self.retention_minutes * 60)
    }

    pub fn ingest_line(
        &mut self,
        line: &str,
        resolved: Option<&ResolvedOutbound>,
    ) -> Option<AuditEvent> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or_default();
        self.ingest_line_at(line, now, resolved)
    }

    pub fn ingest_line_at(
        &mut self,
        line: &str,
        now: u64,
        resolved: Option<&ResolvedOutbound>,
    ) -> Option<AuditEvent> {
        if !self.enabled {
            return None;
        }
        self.expire_at(now);
        self.remember_process_line_at(line, now);
        self.remember_dns_line(line, now);
        let parsed = parse_connection_line(line)?;
        if parsed.route_kind != RouteKind::Proxy {
            return None;
        }
        let context = parsed
            .connection_id
            .as_ref()
            .and_then(|id| self.process_context.get(id))
            .cloned()
            .unwrap_or_default();
        let process_path = parsed.process_path.clone().or(context.path);
        let process_name = parsed.process_name.clone().or(context.name).or_else(|| {
            process_path
                .as_deref()
                .and_then(|path| path.rsplit(['\\', '/']).next())
                .filter(|name| !name.is_empty())
                .map(ToString::to_string)
        });
        let dns_candidates = self.dns_candidates(&parsed, process_path.as_deref(), now);
        let (target, resolved_ip, domain_source, domain_confidence, domain_candidates) =
            if let (AuditTarget::Ip(ip), Some(domain)) =
                (&parsed.target, context.sniffed_domain.clone())
            {
                (
                    AuditTarget::Domain(domain),
                    Some(ip.clone()),
                    Some("sniffed".to_string()),
                    Some("high".to_string()),
                    Vec::new(),
                )
            } else if let (AuditTarget::Ip(ip), [domain]) =
                (&parsed.target, dns_candidates.as_slice())
            {
                (
                    AuditTarget::Domain(domain.clone()),
                    Some(ip.clone()),
                    Some("dns".to_string()),
                    Some("high".to_string()),
                    Vec::new(),
                )
            } else if let (AuditTarget::Ip(_), candidates) =
                (&parsed.target, dns_candidates.as_slice())
                && !candidates.is_empty()
            {
                (
                    parsed.target.clone(),
                    None,
                    Some("dns".to_string()),
                    Some("ambiguous".to_string()),
                    candidates.to_vec(),
                )
            } else if matches!(parsed.target, AuditTarget::Domain(_)) {
                (
                    parsed.target.clone(),
                    context.resolved_ip.clone(),
                    Some("connection".to_string()),
                    Some("high".to_string()),
                    Vec::new(),
                )
            } else {
                (parsed.target.clone(), None, None, None, Vec::new())
            };
        let resolved = resolved.cloned().unwrap_or_else(|| ResolvedOutbound {
            kind: parsed.route_kind,
            chain: parsed.outbound_tag.clone().into_iter().collect(),
            final_node: None,
        });
        if resolved.kind != RouteKind::Proxy {
            return None;
        }
        let key = AuditKey {
            pid: parsed.pid,
            process_path: process_path.clone(),
            target: target.clone(),
            port: parsed.port,
            protocol: parsed.protocol,
        };
        let event = AuditEvent {
            event_id: self.next_event_id,
            first_seen: now,
            last_seen: now,
            occurrence_count: 1,
            connection_id: parsed.connection_id,
            pid: parsed.pid,
            process_name,
            process_path,
            target_display: target.display().to_string(),
            resolved_ip,
            domain_source,
            domain_confidence,
            domain_candidates,
            target,
            port: parsed.port,
            protocol: parsed.protocol,
            route_kind: resolved.kind,
            outbound_tag: parsed.outbound_tag,
            outbound_chain: resolved.chain,
            final_node: resolved.final_node,
            matched_rule_index: context.rule.as_ref().and_then(|rule| rule.index),
            matched_rule_tag: context.rule.as_ref().and_then(|rule| rule.tag.clone()),
            matched_rule_summary: context.rule.as_ref().map(|rule| rule.summary.clone()),
            matched_rule_action: context.rule.as_ref().and_then(|rule| rule.action.clone()),
            matched_rule_raw_line: context.rule.as_ref().map(|rule| rule.raw_line.clone()),
            raw_line: parsed.raw_line,
        };

        if let Some(existing) = self.current.get_mut(&key)
            && existing.fingerprint() == event.fingerprint()
        {
            existing.last_seen = now;
            existing.occurrence_count = existing.occurrence_count.saturating_add(1);
            existing.connection_id = event.connection_id;
            existing.raw_line = event.raw_line;
            if let Some(history_event) = self.history.iter_mut().rev().find(|history_event| {
                history_event.pid == existing.pid
                    && history_event.process_path == existing.process_path
                    && history_event.target == existing.target
                    && history_event.port == existing.port
                    && history_event.protocol == existing.protocol
                    && history_event.fingerprint() == existing.fingerprint()
            }) {
                history_event.last_seen = existing.last_seen;
                history_event.occurrence_count = existing.occurrence_count;
                history_event.connection_id = existing.connection_id.clone();
                history_event.raw_line = existing.raw_line.clone();
            }
            return None;
        }

        self.next_event_id = self.next_event_id.checked_add(1).unwrap_or(1);
        self.current.insert(key, event.clone());
        self.history.push_back(event.clone());
        while self.history.len() > MAX_AUDIT_EVENTS {
            if let Some(expired) = self.history.pop_front() {
                self.current
                    .retain(|_, current| current.event_id != expired.event_id);
            }
        }
        Some(event)
    }

    pub fn snapshot(&mut self) -> Vec<AuditEvent> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or_default();
        self.snapshot_at(now)
    }

    pub fn snapshot_at(&mut self, now: u64) -> Vec<AuditEvent> {
        self.expire_at(now);
        self.current.values().cloned().collect()
    }

    pub fn history(&mut self) -> Vec<AuditEvent> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or_default();
        self.history_at(now)
    }

    pub fn history_at(&mut self, now: u64) -> Vec<AuditEvent> {
        self.expire_at(now);
        self.history.iter().cloned().collect()
    }

    pub fn clear(&mut self) {
        self.current.clear();
        self.history.clear();
        self.process_context.clear();
        self.dns_observations.clear();
    }

    pub fn prune_dead_processes<F>(&mut self, mut is_alive: F)
    where
        F: FnMut(u32) -> bool,
    {
        self.current
            .retain(|_, event| event.pid.is_none_or(&mut is_alive));
    }

    pub fn remember_process_line(&mut self, line: &str) -> Option<()> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or_default();
        self.remember_process_line_at(line, now)
    }

    fn remember_process_line_at(&mut self, line: &str, now: u64) -> Option<()> {
        let connection_id = parse_connection_id(line)?;
        let lower = line.to_ascii_lowercase();
        let context_exists = self.process_context.contains_key(&connection_id);
        let context = self
            .process_context
            .entry(connection_id.clone())
            .or_default();
        context.last_seen = now;
        let mut found = false;
        if let Some(pos) = lower.find("process path:") {
            let value = line[pos + "process path:".len()..].trim();
            if !value.is_empty() {
                context.path = Some(value.to_string());
                found = true;
            }
        }
        if let Some(pos) = lower.find("process name:") {
            let value = line[pos + "process name:".len()..].trim();
            if !value.is_empty() {
                context.name = Some(value.to_string());
                found = true;
            }
        }
        if let Some(domain) = parse_sniffed_domain(line) {
            context.sniffed_domain = Some(domain);
            found = true;
        }
        if let Some(ip) = parse_resolved_ip(line) {
            context.resolved_ip = Some(ip);
            found = true;
        }
        if let Some(rule) = parse_rule_context(line) {
            context.rule = Some(rule);
            found = true;
        }
        if found {
            self.trim_process_contexts();
            Some(())
        } else {
            if !context_exists {
                self.process_context.remove(&connection_id);
            }
            None
        }
    }

    fn remember_dns_line(&mut self, line: &str, now: u64) {
        let Some((domain, ip)) = parse_dns_result(line) else {
            return;
        };
        let connection_id = parse_connection_id(line);
        let context = connection_id
            .as_ref()
            .and_then(|id| self.process_context.get(id));
        let pid = extract_value(line, "pid=").and_then(|value| value.parse::<u32>().ok());
        let process_path = extract_value(line, "process_path=")
            .map(ToString::to_string)
            .or_else(|| context.and_then(|ctx| ctx.path.clone()));
        self.dns_observations.push_back(DnsObservation {
            pid,
            process_path,
            ip,
            domain,
            seen_at: now,
        });
        while self.dns_observations.len() > MAX_AUDIT_EVENTS {
            self.dns_observations.pop_front();
        }
    }

    fn dns_candidates(
        &self,
        parsed: &ParsedConnection,
        process_path: Option<&str>,
        now: u64,
    ) -> Vec<String> {
        let AuditTarget::Ip(ip) = &parsed.target else {
            return Vec::new();
        };
        let mut candidates = self
            .dns_observations
            .iter()
            .filter(|observation| now.saturating_sub(observation.seen_at) <= 5 * 60)
            .filter(|observation| &observation.ip == ip)
            .filter(|observation| {
                let pid_matches = parsed
                    .pid
                    .zip(observation.pid)
                    .is_some_and(|(left, right)| left == right);
                let path_matches = process_path
                    .zip(observation.process_path.as_deref())
                    .is_some_and(|(left, right)| left.eq_ignore_ascii_case(right));
                pid_matches || path_matches
            })
            .map(|observation| observation.domain.clone())
            .collect::<Vec<_>>();
        candidates.sort_unstable();
        candidates.dedup();
        candidates
    }

    fn expire_at(&mut self, now: u64) {
        let cutoff = now.saturating_sub(self.retention_minutes * 60);
        self.current.retain(|_, event| event.last_seen > cutoff);
        self.history.retain(|event| event.last_seen > cutoff);
        self.dns_observations
            .retain(|observation| observation.seen_at > now.saturating_sub(5 * 60));
        self.process_contexts_retain_recent(now);
    }

    fn process_contexts_retain_recent(&mut self, now: u64) {
        self.process_context.retain(|_, context| {
            context.last_seen > now.saturating_sub(PROCESS_CONTEXT_TTL_SECONDS)
        });
    }

    fn trim_process_contexts(&mut self) {
        while self.process_context.len() > MAX_AUDIT_EVENTS {
            let Some(oldest) = self
                .process_context
                .iter()
                .min_by_key(|(_, context)| context.last_seen)
                .map(|(connection_id, _)| connection_id.clone())
            else {
                break;
            };
            self.process_context.remove(&oldest);
        }
    }
}

impl Default for ConnectionAuditStore {
    fn default() -> Self {
        Self::new()
    }
}

pub fn parse_connection_line(line: &str) -> Option<ParsedConnection> {
    let lower = line.to_ascii_lowercase();
    let (outbound_pos, outbound_start) = if let Some(pos) = lower.find("using outbound/") {
        (pos, pos + "using outbound/".len())
    } else {
        let pos = lower.find("outbound/")?;
        (pos, pos + "outbound/".len())
    };
    let outbound_fragment = &line[outbound_start..];
    let outbound_end = outbound_fragment
        .find([':', '[', ']', ' ', ','])
        .unwrap_or(outbound_fragment.len());
    let outbound_type = outbound_fragment[..outbound_end].trim();
    if outbound_type.is_empty() {
        return None;
    }
    let outbound_tag = outbound_fragment
        .strip_prefix(outbound_type)
        .and_then(|fragment| fragment.strip_prefix('['))
        .and_then(|fragment| fragment.split(']').next())
        .map(str::trim)
        .filter(|tag| !tag.is_empty())
        .map(ToString::to_string)
        .or_else(|| Some(outbound_type.to_string()));

    let before_outbound = line[..outbound_pos].trim();
    let target_tail = if let Some(pos) = lower.rfind("connection to ") {
        &line[pos + "connection to ".len()..]
    } else {
        let pos = before_outbound.to_ascii_lowercase().rfind("router:")?;
        &before_outbound[pos + "router:".len()..]
    };
    let target_token = target_tail
        .split_whitespace()
        .next()?
        .trim_matches(|ch: char| matches!(ch, ',' | ';' | ')' | ']'));
    let (target, port) = parse_target(target_token)?;
    let protocol = if lower
        .split_whitespace()
        .any(|word| word == "udp" || word == "udp:")
    {
        NetworkProtocol::Udp
    } else if lower
        .split_whitespace()
        .any(|word| word == "tcp" || word == "tcp:")
        || lower.contains("outbound connection to ")
    {
        NetworkProtocol::Tcp
    } else {
        return None;
    };

    let route_kind = match outbound_type.to_ascii_lowercase().as_str() {
        "direct" => RouteKind::Direct,
        "block" | "reject" => RouteKind::Blocked,
        _ => RouteKind::Proxy,
    };
    Some(ParsedConnection {
        connection_id: parse_connection_id(line),
        target,
        port,
        protocol,
        pid: extract_value(line, "pid=").and_then(|value| value.parse().ok()),
        process_name: extract_value(line, "process_name=").map(ToString::to_string),
        process_path: extract_value(line, "process_path=").map(ToString::to_string),
        route_kind,
        outbound_tag,
        raw_line: line.to_string(),
    })
}

fn parse_connection_id(line: &str) -> Option<String> {
    for (bracket, _) in line.match_indices('[').rev() {
        let fragment = &line[bracket + 1..];
        let digits = fragment
            .chars()
            .take_while(|ch| ch.is_ascii_digit())
            .count();
        if digits > 0 && fragment[digits..].starts_with(' ') {
            return Some(fragment[..digits].to_string());
        }
    }
    None
}

fn extract_value<'a>(line: &'a str, marker: &str) -> Option<&'a str> {
    let start = line
        .to_ascii_lowercase()
        .find(&marker.to_ascii_lowercase())?
        + marker.len();
    let rest = &line[start..];
    let end = [
        " process_name=",
        " process_path=",
        " pid=",
        " using outbound/",
    ]
    .iter()
    .filter_map(|next| rest.to_ascii_lowercase().find(next))
    .min()
    .unwrap_or(rest.len());
    let value = rest[..end].trim();
    (!value.is_empty()).then_some(value)
}

fn parse_sniffed_domain(line: &str) -> Option<String> {
    let lower = line.to_ascii_lowercase();
    let marker = "sniffed domain";
    let start = lower.find(marker)? + marker.len();
    let value = line[start..]
        .trim_start_matches([':', '=', ' ', '\t'])
        .split_whitespace()
        .next()?
        .trim_matches(|ch: char| matches!(ch, ',' | ';' | ')' | ']' | '"'));
    if value.is_empty() || value.parse::<IpAddr>().is_ok() {
        return None;
    }
    Some(value.to_string())
}

fn parse_resolved_ip(line: &str) -> Option<String> {
    let lower = line.to_ascii_lowercase();
    let marker = ["resolved ip", "resolved address", "resolved to"]
        .iter()
        .find_map(|marker| lower.find(marker).map(|position| (*marker, position)))?;
    let value = line[marker.1 + marker.0.len()..]
        .trim_start_matches([':', '=', ' ', '\t'])
        .split_whitespace()
        .next()?
        .trim_matches(|ch: char| matches!(ch, '[' | ']' | ',' | ';' | ')' | '"'));
    value.parse::<IpAddr>().ok().map(|ip| ip.to_string())
}

fn parse_rule_context(line: &str) -> Option<RuleContext> {
    let lower = line.to_ascii_lowercase();
    let marker = "match[";
    let start = lower.find(marker)? + marker.len();
    let rest = &line[start..];
    let end = rest.find(']')?;
    let index = rest[..end].trim().parse::<u32>().ok();
    let summary = rest[end + 1..]
        .trim()
        .trim_start_matches([':', '-', '>'])
        .trim()
        .to_string();
    let action = summary
        .split_once("=>")
        .map(|(_, action)| action.trim())
        .filter(|action| !action.is_empty())
        .and_then(|action| action.split_whitespace().next())
        .map(ToString::to_string);
    let tag = lower.find("tag=").and_then(|position| {
        let value = &line[position + "tag=".len()..];
        value
            .split_whitespace()
            .next()
            .map(|value| value.trim_matches(|ch: char| matches!(ch, ',' | ';' | ']')))
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
    });
    Some(RuleContext {
        index,
        tag,
        summary,
        action,
        raw_line: line.to_string(),
    })
}

fn parse_dns_result(line: &str) -> Option<(String, String)> {
    let lower = line.to_ascii_lowercase();
    if !lower.contains("dns:") {
        return None;
    }
    let (left, right) = line.split_once("->")?;
    let domain = left
        .split_whitespace()
        .rev()
        .find(|token| {
            let token = token.trim_matches(|ch: char| matches!(ch, ':' | ',' | ';' | '(' | ')'));
            !token.is_empty()
                && token.parse::<IpAddr>().is_err()
                && !matches!(
                    token.to_ascii_lowercase().as_str(),
                    "query" | "exchange" | "resolved"
                )
        })?
        .trim_matches(|ch: char| matches!(ch, ':' | ',' | ';' | '(' | ')'))
        .to_string();
    let ip = right
        .split_whitespace()
        .next()?
        .trim_matches(|ch: char| matches!(ch, ':' | ',' | ';' | '(' | ')' | ']'))
        .parse::<IpAddr>()
        .ok()?
        .to_string();
    Some((domain, ip))
}

fn parse_target(token: &str) -> Option<(AuditTarget, u16)> {
    let token = token.trim_matches(|ch: char| matches!(ch, ',' | ';' | ')' | ']'));
    let (host, port) = if token.starts_with('[') {
        let closing = token.find(']')?;
        let port = token.get(closing + 1..)?.strip_prefix(':')?.parse().ok()?;
        (&token[1..closing], port)
    } else {
        let (host, port) = token.rsplit_once(':')?;
        (host, port.parse().ok()?)
    };
    if host.is_empty() {
        return None;
    }
    if host.parse::<IpAddr>().is_ok() {
        Some((AuditTarget::Ip(host.to_string()), port))
    } else {
        Some((AuditTarget::Domain(host.to_string()), port))
    }
}

pub fn expand_outbound_chain(proxies: &serde_json::Value, root: &str) -> ResolvedOutbound {
    let entries = proxies
        .get("proxies")
        .and_then(serde_json::Value::as_object);
    let mut chain = Vec::new();
    let mut current = root.to_string();
    let mut unresolved = false;

    for _ in 0..16 {
        let Some(entry) = entries.and_then(|items| items.get(&current)) else {
            unresolved = true;
            break;
        };
        let kind = entry
            .get("type")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_ascii_lowercase();
        if kind == "direct" {
            return ResolvedOutbound {
                kind: RouteKind::Direct,
                chain: Vec::new(),
                final_node: None,
            };
        }
        chain.push(current.clone());
        let Some(next) = entry.get("now").and_then(serde_json::Value::as_str) else {
            return ResolvedOutbound {
                kind: RouteKind::Proxy,
                final_node: chain.last().cloned(),
                chain,
            };
        };
        if next.is_empty() || next == current {
            break;
        }
        current = next.to_string();
        if !matches!(
            kind.as_str(),
            "selector" | "urltest" | "url-test" | "fallback" | "loadbalance"
        ) {
            break;
        }
    }

    if current.eq_ignore_ascii_case("direct") {
        ResolvedOutbound {
            kind: RouteKind::Direct,
            chain: Vec::new(),
            final_node: None,
        }
    } else {
        if chain.last().map(String::as_str) != Some(current.as_str()) {
            chain.push(current.clone());
        }
        ResolvedOutbound {
            kind: RouteKind::Proxy,
            final_node: (!unresolved).then(|| chain.last().cloned()).flatten(),
            chain,
        }
    }
}
