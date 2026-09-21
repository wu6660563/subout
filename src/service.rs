use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::{Mutex, RwLock, mpsc};
use tokio::task::JoinHandle;

use crate::audit::{
    AuditEvent, ConnectionAuditStore, ResolvedOutbound, RouteKind, expand_outbound_chain,
    parse_connection_line,
};
use crate::kernel;

const MAX_LOG_LINES: usize = 1000;
const AUDIT_QUEUE_CAPACITY: usize = 4096;
const AUDIT_OUTBOUND_CACHE_TTL: Duration = Duration::from_secs(2);
const AUDIT_DUPLICATE_WINDOW: Duration = Duration::from_secs(1);

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum SingboxLogLevel {
    Trace = 10,
    Debug = 20,
    Info = 30,
    Warn = 40,
    Error = 50,
    Fatal = 60,
    Panic = 70,
}

impl std::str::FromStr for SingboxLogLevel {
    type Err = ();

    fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
        match s.trim().to_lowercase().as_str() {
            "trace" => Ok(Self::Trace),
            "debug" => Ok(Self::Debug),
            "info" => Ok(Self::Info),
            "warn" | "warning" => Ok(Self::Warn),
            "error" => Ok(Self::Error),
            "fatal" => Ok(Self::Fatal),
            "panic" => Ok(Self::Panic),
            _ => Err(()),
        }
    }
}

impl SingboxLogLevel {
    pub fn parse(s: &str) -> Option<Self> {
        s.parse().ok()
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Trace => "trace",
            Self::Debug => "debug",
            Self::Info => "info",
            Self::Warn => "warn",
            Self::Error => "error",
            Self::Fatal => "fatal",
            Self::Panic => "panic",
        }
    }
}

pub fn parse_singbox_log_level(line: &str) -> Option<SingboxLogLevel> {
    if line.is_empty() {
        return None;
    }
    let upper = line.to_ascii_uppercase();
    if upper.contains("PANIC[")
        || upper
            .split_whitespace()
            .any(|w| w == "PANIC" || w == "PANIC:")
    {
        return Some(SingboxLogLevel::Panic);
    }
    if upper.contains("FATAL[")
        || upper
            .split_whitespace()
            .any(|w| w == "FATAL" || w == "FATAL:")
    {
        return Some(SingboxLogLevel::Fatal);
    }
    if upper.contains("ERROR[")
        || upper
            .split_whitespace()
            .any(|w| w == "ERROR" || w == "ERROR:")
        || upper.contains("❌")
    {
        return Some(SingboxLogLevel::Error);
    }
    if upper.contains("WARN[")
        || upper.contains("WARNING[")
        || upper
            .split_whitespace()
            .any(|w| w == "WARN" || w == "WARN:" || w == "WARNING" || w == "WARNING:")
        || upper.contains("⚠️")
    {
        return Some(SingboxLogLevel::Warn);
    }
    if upper.contains("INFO[")
        || upper
            .split_whitespace()
            .any(|w| w == "INFO" || w == "INFO:")
    {
        return Some(SingboxLogLevel::Info);
    }
    if upper.contains("DEBUG[")
        || upper
            .split_whitespace()
            .any(|w| w == "DEBUG" || w == "DEBUG:")
    {
        return Some(SingboxLogLevel::Debug);
    }
    if upper.contains("TRACE[")
        || upper
            .split_whitespace()
            .any(|w| w == "TRACE" || w == "TRACE:")
    {
        return Some(SingboxLogLevel::Trace);
    }
    None
}

pub fn should_record_singbox_line(
    line: &str,
    configured_level: SingboxLogLevel,
    disabled: bool,
) -> bool {
    if disabled {
        return false;
    }
    if let Some(lvl) = parse_singbox_log_level(line) {
        lvl >= configured_level
    } else if is_actual_singbox_error(line) {
        true
    } else {
        configured_level <= SingboxLogLevel::Info
    }
}

pub async fn append_to_file(path: &Path, line: &str) {
    if let Some(parent) = path.parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }
    if let Ok(metadata) = tokio::fs::metadata(path).await
        && metadata.len() > 5 * 1024 * 1024
    {
        let rotated = path.with_extension("log.1");
        let _ = tokio::fs::rename(path, rotated).await;
    }
    if let Ok(mut file) = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .await
    {
        use tokio::io::AsyncWriteExt;
        let _ = file.write_all(format!("{}\n", line).as_bytes()).await;
    }
}

async fn ingest_audit_line(
    audit: Arc<RwLock<ConnectionAuditStore>>,
    clash_api: Arc<RwLock<Option<ClashApiConfig>>>,
    node_subscription_labels: Arc<RwLock<HashMap<String, String>>>,
    outbound_cache: Arc<RwLock<Option<AuditOutboundCache>>>,
    generation: Arc<AtomicU64>,
    line_generation: u64,
    line: &str,
) {
    if generation.load(Ordering::Acquire) != line_generation {
        return;
    }
    if !audit.read().await.is_enabled() {
        return;
    }
    let Some(parsed) = parse_connection_line(line) else {
        let mut audit = audit.write().await;
        if generation.load(Ordering::Acquire) == line_generation {
            audit.ingest_line(line, None);
        }
        return;
    };
    if parsed.route_kind == RouteKind::Direct {
        return;
    }
    let resolved = if parsed.route_kind == RouteKind::Proxy {
        if let Some(tag) = parsed.outbound_tag.as_deref() {
            let labels = node_subscription_labels.read().await.clone();
            resolve_runtime_outbound(clash_api.read().await.clone(), tag, &labels, outbound_cache)
                .await
        } else {
            None
        }
    } else {
        None
    };
    let mut audit = audit.write().await;
    if generation.load(Ordering::Acquire) == line_generation {
        audit.ingest_line(line, resolved.as_ref());
    }
}

#[derive(Debug)]
struct AuditQueueLine {
    generation: u64,
    line: String,
}

fn enqueue_audit_line(
    sender: &mpsc::Sender<AuditQueueLine>,
    generation: &AtomicU64,
    dropped: &AtomicU64,
    line: &str,
) {
    match sender.try_send(AuditQueueLine {
        generation: generation.load(Ordering::Acquire),
        line: line.to_string(),
    }) {
        Err(mpsc::error::TrySendError::Full(_)) => {
            dropped.fetch_add(1, Ordering::Relaxed);
        }
        Ok(()) | Err(mpsc::error::TrySendError::Closed(_)) => {}
    }
}

struct AuditLineDeduplicator {
    recent_lines: HashMap<String, Instant>,
    last_pruned: Instant,
}

impl AuditLineDeduplicator {
    fn new() -> Self {
        Self {
            recent_lines: HashMap::new(),
            last_pruned: Instant::now(),
        }
    }

    fn should_ingest(&mut self, line: &str) -> bool {
        let now = Instant::now();
        if now.duration_since(self.last_pruned) >= AUDIT_DUPLICATE_WINDOW {
            self.recent_lines
                .retain(|_, seen_at| now.duration_since(*seen_at) < AUDIT_DUPLICATE_WINDOW);
            self.last_pruned = now;
        }
        if self
            .recent_lines
            .get(line)
            .is_some_and(|seen_at| now.duration_since(*seen_at) < AUDIT_DUPLICATE_WINDOW)
        {
            return false;
        }
        self.recent_lines.insert(line.to_string(), now);
        true
    }
}

async fn resolve_runtime_outbound(
    config: Option<ClashApiConfig>,
    outbound_tag: &str,
    node_subscription_labels: &HashMap<String, String>,
    cache: Arc<RwLock<Option<AuditOutboundCache>>>,
) -> Option<ResolvedOutbound> {
    let config = config?;
    let response = cached_audit_proxies(&cache, &config).await;
    let response = match response {
        Some(response) => response,
        None => {
            let response = Arc::new(
                reqwest::Client::new()
                    .get(format!("{}/proxies", config.base_url.trim_end_matches('/')))
                    .bearer_auth(&config.secret)
                    .timeout(Duration::from_millis(500))
                    .send()
                    .await
                    .ok()?
                    .error_for_status()
                    .ok()?
                    .json::<Value>()
                    .await
                    .ok()?,
            );
            *cache.write().await = Some(AuditOutboundCache {
                base_url: config.base_url.clone(),
                fetched_at: Instant::now(),
                response: response.clone(),
            });
            response
        }
    };
    let mut resolved = expand_outbound_chain(&response, outbound_tag);
    decorate_final_node_with_subscription(&mut resolved, node_subscription_labels);
    Some(resolved)
}

async fn cached_audit_proxies(
    cache: &RwLock<Option<AuditOutboundCache>>,
    config: &ClashApiConfig,
) -> Option<Arc<Value>> {
    cache
        .read()
        .await
        .as_ref()
        .filter(|entry| {
            entry.base_url == config.base_url
                && entry.fetched_at.elapsed() < AUDIT_OUTBOUND_CACHE_TTL
        })
        .map(|entry| entry.response.clone())
}

fn decorate_final_node_with_subscription(
    resolved: &mut ResolvedOutbound,
    node_subscription_labels: &HashMap<String, String>,
) {
    let Some(node) = resolved.final_node.as_ref() else {
        return;
    };
    let Some(subscription) = node_subscription_labels.get(node) else {
        return;
    };
    resolved.final_node = Some(format!("{subscription}/{node}"));
}

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
pub struct ConflictingProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cmdline: Option<String>,
    pub exe_path: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ServiceStatusInfo {
    pub running: bool,
    pub ready: bool,
    pub pid: Option<u32>,
    pub started_at: Option<u64>,
    pub uptime_secs: Option<u64>,
    pub last_error: Option<String>,
    pub binary_path: Option<String>,
    pub config_path: String,
    pub inbounds_summary: Option<String>,
    pub is_tun: bool,
    pub conflicting_processes: Vec<ConflictingProcessInfo>,
    pub log_level: Option<String>,
    #[serde(default)]
    pub log_disabled: bool,
    #[serde(default)]
    pub log_output: Option<String>,
}

pub struct SingBoxServiceManager {
    child: Arc<RwLock<Option<tokio::process::Child>>>,
    // The Child handle is only valid for the current Subout process. Keep the
    // PID separately so a transient handle error does not turn a live core
    // into a false "stopped" state. On a Subout restart, Windows can recover
    // this PID by matching the exact generated config path.
    managed_pid: Arc<RwLock<Option<u32>>>,
    started_at: Arc<RwLock<Option<u64>>>,
    ready: Arc<RwLock<bool>>,
    last_error: Arc<RwLock<Option<String>>>,
    logs: Arc<RwLock<VecDeque<String>>>,
    cached_sudo_pass: Arc<RwLock<Option<String>>>,
    db_path: Arc<RwLock<Option<String>>>,
    current_log_level: Arc<RwLock<String>>,
    current_log_disabled: Arc<RwLock<bool>>,
    current_log_output: Arc<RwLock<Option<String>>>,
    audit: Arc<RwLock<ConnectionAuditStore>>,
    audit_recording_enabled: Arc<RwLock<bool>>,
    audit_tun_active: Arc<RwLock<bool>>,
    clash_api: Arc<RwLock<Option<ClashApiConfig>>>,
    node_subscription_labels: Arc<RwLock<HashMap<String, String>>>,
    audit_outbound_cache: Arc<RwLock<Option<AuditOutboundCache>>>,
    audit_queue: Arc<RwLock<Option<mpsc::Sender<AuditQueueLine>>>>,
    audit_queue_dropped: Arc<AtomicU64>,
    audit_queue_generation: Arc<AtomicU64>,
    audit_worker: Arc<Mutex<Option<JoinHandle<()>>>>,
    conflict_cache: Arc<RwLock<Option<ConflictCache>>>,
}

#[derive(Clone)]
struct ConflictCache {
    managed_pid: Option<u32>,
    refreshed_at: Instant,
    processes: Vec<ConflictingProcessInfo>,
}

#[derive(Clone, Debug)]
struct ClashApiConfig {
    base_url: String,
    secret: String,
}

#[derive(Clone)]
struct AuditOutboundCache {
    base_url: String,
    fetched_at: Instant,
    response: Arc<Value>,
}

impl Default for SingBoxServiceManager {
    fn default() -> Self {
        Self::new()
    }
}

impl SingBoxServiceManager {
    pub fn new() -> Self {
        let mut audit_store = ConnectionAuditStore::new();
        audit_store.set_enabled(false);
        Self {
            child: Arc::new(RwLock::new(None)),
            managed_pid: Arc::new(RwLock::new(None)),
            started_at: Arc::new(RwLock::new(None)),
            ready: Arc::new(RwLock::new(false)),
            last_error: Arc::new(RwLock::new(None)),
            logs: Arc::new(RwLock::new(VecDeque::with_capacity(MAX_LOG_LINES))),
            cached_sudo_pass: Arc::new(RwLock::new(None)),
            db_path: Arc::new(RwLock::new(None)),
            current_log_level: Arc::new(RwLock::new("info".to_string())),
            current_log_disabled: Arc::new(RwLock::new(false)),
            current_log_output: Arc::new(RwLock::new(None)),
            audit: Arc::new(RwLock::new(audit_store)),
            audit_recording_enabled: Arc::new(RwLock::new(true)),
            audit_tun_active: Arc::new(RwLock::new(false)),
            clash_api: Arc::new(RwLock::new(None)),
            node_subscription_labels: Arc::new(RwLock::new(HashMap::new())),
            audit_outbound_cache: Arc::new(RwLock::new(None)),
            audit_queue: Arc::new(RwLock::new(None)),
            audit_queue_dropped: Arc::new(AtomicU64::new(0)),
            audit_queue_generation: Arc::new(AtomicU64::new(0)),
            audit_worker: Arc::new(Mutex::new(None)),
            conflict_cache: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn set_db_path(&self, db_path: &str) {
        *self.db_path.write().await = Some(db_path.to_string());
        if let Ok(conn) = rusqlite::Connection::open(db_path) {
            if let Ok(Some(value)) =
                crate::db::get_setting(&conn, "connection_audit_retention_minutes")
                && let Ok(minutes) = value.parse::<u64>()
            {
                self.audit.write().await.set_retention_minutes(minutes);
            }
            if let Ok(Some(value)) =
                crate::db::get_setting(&conn, "connection_audit_recording_enabled")
                && let Ok(enabled) = value.parse::<bool>()
            {
                *self.audit_recording_enabled.write().await = enabled;
            }
        }
        self.refresh_audit_node_subscription_labels().await;
        self.sync_audit_recording_state().await;
    }

    async fn refresh_audit_node_subscription_labels(&self) {
        let Some(db_path) = self.db_path.read().await.clone() else {
            self.node_subscription_labels.write().await.clear();
            return;
        };
        let mut labels = HashMap::new();
        let mut duplicate_tags = HashSet::new();
        if let Ok(conn) = rusqlite::Connection::open(db_path)
            && let Ok(nodes) = crate::db::get_nodes(&conn)
        {
            for node in nodes {
                let Some(label) = node.subscription_label else {
                    continue;
                };
                if labels.insert(node.tag.clone(), label).is_some() {
                    duplicate_tags.insert(node.tag);
                }
            }
        }
        for tag in duplicate_tags {
            labels.remove(&tag);
        }
        *self.node_subscription_labels.write().await = labels;
    }

    pub async fn load_saved_sudo_pass(&self) {
        self.delete_legacy_saved_sudo_pass().await;
    }

    pub async fn save_sudo_pass(&self, pass: &str) {
        let trimmed = pass.trim();
        if trimmed.is_empty() {
            self.clear_saved_sudo_pass().await;
            return;
        }
        *self.cached_sudo_pass.write().await = Some(trimmed.to_string());
    }

    async fn delete_legacy_saved_sudo_pass(&self) {
        if let Some(ref path) = *self.db_path.read().await
            && let Ok(conn) = rusqlite::Connection::open(path)
        {
            let _ = crate::db::delete_setting(&conn, "sudo_password");
        }
    }

    pub async fn clear_saved_sudo_pass(&self) {
        *self.cached_sudo_pass.write().await = None;
        if let Some(ref path) = *self.db_path.read().await
            && let Ok(conn) = rusqlite::Connection::open(path)
        {
            let _ = crate::db::delete_setting(&conn, "sudo_password");
        }
    }

    pub async fn has_saved_sudo_pass(&self) -> bool {
        self.cached_sudo_pass.read().await.is_some()
    }

    pub async fn validate_and_save_sudo_pass(&self, pass: &str) -> Result<()> {
        let trimmed = pass.trim();
        if trimmed.is_empty() {
            self.clear_saved_sudo_pass().await;
            return Ok(());
        }

        let platform = crate::platform::current_platform();
        if !platform.is_windows() && !platform.is_running_as_root() {
            platform
                .run_sudo_command("true", &[], Some(trimmed))
                .await
                .map_err(|e| anyhow!("Sudo 密码验证失败: {}", e))?;
        }

        self.save_sudo_pass(trimmed).await;
        Ok(())
    }

    pub fn get_running_config_path() -> PathBuf {
        crate::paths::AppPaths::get().running_config_path()
    }

    pub async fn append_log(&self, line: &str) {
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let formatted = format!("[{}] {}", timestamp, line.trim_end());
        {
            let mut logs = self.logs.write().await;
            if logs.len() >= MAX_LOG_LINES {
                logs.pop_front();
            }
            logs.push_back(formatted.clone());
        }
        if let Some(sender) = self.audit_queue.read().await.clone() {
            enqueue_audit_line(
                &sender,
                &self.audit_queue_generation,
                &self.audit_queue_dropped,
                line,
            );
        } else {
            self.audit.write().await.ingest_line(line, None);
        }
        let log_file = crate::paths::AppPaths::get().log_dir.join("subout.log");
        append_to_file(&log_file, &formatted).await;
    }

    pub async fn get_logs(&self) -> Vec<String> {
        let logs = self.logs.read().await;
        logs.iter().cloned().collect()
    }

    pub async fn clear_logs(&self) {
        let mut logs = self.logs.write().await;
        logs.clear();
        let log_file = crate::paths::AppPaths::get().log_dir.join("subout.log");
        let _ = tokio::fs::remove_file(log_file).await;
    }

    pub async fn get_audit_snapshot(&self) -> Vec<AuditEvent> {
        self.get_audit_records().await.0
    }

    pub async fn get_audit_history(&self) -> Vec<AuditEvent> {
        self.get_audit_records().await.1
    }

    pub async fn get_audit_records(&self) -> (Vec<AuditEvent>, Vec<AuditEvent>) {
        let running = self.get_managed_pid().await.is_some();
        let mut audit = self.audit.write().await;
        if running {
            let platform = crate::platform::current_platform();
            audit.prune_dead_processes(|pid| platform.is_pid_alive(pid));
        }
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or_default();
        let current = audit.snapshot_at(now);
        let events = audit.history_at(now);
        (current, events)
    }

    pub async fn clear_audit(&self) {
        self.audit_queue_generation.fetch_add(1, Ordering::AcqRel);
        self.audit.write().await.clear();
        self.audit_queue_dropped.store(0, Ordering::Relaxed);
    }

    pub async fn audit_retention_minutes(&self) -> u64 {
        self.audit.read().await.retention_minutes()
    }

    pub fn audit_queue_dropped_lines(&self) -> u64 {
        self.audit_queue_dropped.load(Ordering::Relaxed)
    }

    pub async fn audit_recording_enabled(&self) -> bool {
        *self.audit_recording_enabled.read().await
    }

    pub async fn set_audit_recording_enabled(&self, enabled: bool) -> Result<bool> {
        *self.audit_recording_enabled.write().await = enabled;
        self.sync_audit_recording_state().await;
        if let Some(path) = self.db_path.read().await.clone() {
            let conn = rusqlite::Connection::open(path)?;
            crate::db::update_setting(
                &conn,
                "connection_audit_recording_enabled",
                &enabled.to_string(),
            )?;
        }
        Ok(enabled)
    }

    pub async fn set_audit_retention_minutes(&self, minutes: u64) -> Result<u64> {
        let normalized = self.audit.write().await.set_retention_minutes(minutes);
        if let Some(path) = self.db_path.read().await.clone() {
            let conn = rusqlite::Connection::open(path)?;
            crate::db::update_setting(
                &conn,
                "connection_audit_retention_minutes",
                &normalized.to_string(),
            )?;
        }
        Ok(normalized)
    }

    async fn sync_audit_recording_state(&self) {
        let enabled = *self.audit_recording_enabled.read().await;
        let tun_active = *self.audit_tun_active.read().await;
        self.audit.write().await.set_enabled(enabled && tun_active);
    }

    async fn stop_audit_worker(&self) {
        *self.audit_queue.write().await = None;
        if let Some(worker) = self.audit_worker.lock().await.take() {
            worker.abort();
        }
    }

    pub async fn is_running(&self) -> bool {
        self.get_managed_pid().await.is_some()
    }

    pub async fn get_managed_pid(&self) -> Option<u32> {
        let child_state = {
            let mut child_guard = self.child.write().await;
            if let Some(ref mut child) = *child_guard {
                match child.try_wait() {
                    Ok(None) => Some(child.id()),
                    // The operating system has confirmed that the process
                    // exited. Discard both handles; a PID alone must never
                    // keep a stopped service marked as running.
                    Ok(Some(_)) => {
                        *child_guard = None;
                        Some(None)
                    }
                    // Tokio can occasionally fail to query a child handle
                    // while the underlying Windows process is still alive.
                    // Verify the PID natively before treating that as a stop.
                    Err(_) => match child.id() {
                        Some(pid) if crate::platform::current_platform().is_pid_alive(pid) => {
                            Some(Some(pid))
                        }
                        _ => {
                            *child_guard = None;
                            Some(None)
                        }
                    },
                }
            } else {
                None
            }
        };

        match child_state {
            Some(Some(pid)) => {
                *self.managed_pid.write().await = Some(pid);
                return Some(pid);
            }
            Some(None) => {
                *self.managed_pid.write().await = None;
                return None;
            }
            None => {}
        }

        // If Subout owns a remembered PID, use the inexpensive native liveness
        // check. This is the normal path after the process handle is no longer
        // available (for example following a log-pipe failure).
        if let Some(pid) = *self.managed_pid.read().await {
            if crate::platform::current_platform().is_pid_alive(pid) {
                return Some(pid);
            }
            *self.managed_pid.write().await = None;
        }
        None
    }

    /// Process conflict discovery on Windows uses a CIM query and can take
    /// seconds on a busy machine. It is useful diagnostic data, but must not
    /// delay the authoritative service state endpoint. Return the latest
    /// matching snapshot and refresh it in the background at most once every
    /// three seconds.
    async fn get_cached_conflicting_processes(
        &self,
        managed_pid: Option<u32>,
    ) -> Vec<ConflictingProcessInfo> {
        const CONFLICT_CACHE_TTL: Duration = Duration::from_secs(3);

        let cached = self.conflict_cache.read().await.clone();
        let is_fresh = cached.as_ref().is_some_and(|entry| {
            entry.managed_pid == managed_pid && entry.refreshed_at.elapsed() < CONFLICT_CACHE_TTL
        });

        if !is_fresh {
            let cache = self.conflict_cache.clone();
            let config_path = Self::get_running_config_path();
            tokio::spawn(async move {
                let processes = tokio::task::spawn_blocking(move || {
                    crate::platform::current_platform()
                        .detect_conflicting_processes(managed_pid, &config_path)
                })
                .await
                .unwrap_or_default();
                *cache.write().await = Some(ConflictCache {
                    managed_pid,
                    refreshed_at: Instant::now(),
                    processes,
                });
            });
        }

        cached
            .filter(|entry| entry.managed_pid == managed_pid)
            .map(|entry| entry.processes)
            .unwrap_or_default()
    }

    pub async fn find_external_singbox_processes(&self) -> Vec<ConflictingProcessInfo> {
        let managed_pid = self.get_managed_pid().await;
        detect_conflicting_singbox_processes(managed_pid)
    }

    pub async fn get_status(&self) -> ServiceStatusInfo {
        let pid = self.get_managed_pid().await;
        let is_run = pid.is_some();
        if !is_run {
            *self.ready.write().await = false;
            *self.started_at.write().await = None;
        }

        let started_at = if is_run {
            *self.started_at.read().await
        } else {
            None
        };

        let uptime_secs = if let Some(start) = started_at {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            Some(now.saturating_sub(start))
        } else {
            None
        };

        let is_ready = if is_run {
            let r = *self.ready.read().await;
            if r {
                true
            } else if let Some(up) = uptime_secs {
                if up >= 1 {
                    *self.ready.write().await = true;
                    true
                } else {
                    false
                }
            } else {
                true
            }
        } else {
            false
        };

        let last_error = if is_run {
            None
        } else {
            self.last_error.read().await.clone()
        };

        let binary_path = kernel::get_singbox_executable().map(|p| p.to_string_lossy().to_string());
        let running_config_path_buf = Self::get_running_config_path();
        let config_path = running_config_path_buf.to_string_lossy().to_string();
        let inbounds_summary = get_inbounds_summary_from_config(&running_config_path_buf);
        let running_config_content = std::fs::read_to_string(&running_config_path_buf).ok();
        let config_json = running_config_content
            .as_deref()
            .and_then(|s| serde_json::from_str::<Value>(s).ok());
        let is_tun = is_run && config_json.as_ref().map(is_tun_mode).unwrap_or(false);
        let conflicting_processes = self.get_cached_conflicting_processes(pid).await;

        let (log_level, log_disabled, log_output) = if is_run {
            (
                Some(self.current_log_level.read().await.clone()),
                *self.current_log_disabled.read().await,
                self.current_log_output.read().await.clone(),
            )
        } else if let Some(ref c) = config_json {
            let level = c
                .get("log")
                .and_then(|l| l.get("level"))
                .and_then(|lv| lv.as_str())
                .map(|s| s.to_lowercase());
            let disabled = c
                .get("log")
                .and_then(|l| l.get("disabled"))
                .and_then(|d| d.as_bool())
                .unwrap_or(false);
            let output = c
                .get("log")
                .and_then(|l| l.get("output"))
                .and_then(|o| o.as_str())
                .map(|s| s.to_string());
            (level.or(Some("info".to_string())), disabled, output)
        } else if let Some(db_path) = self.db_path.read().await.as_deref()
            && let Ok(conn) = rusqlite::Connection::open(db_path)
        {
            let mode = crate::db::get_setting(&conn, "app_mode")
                .unwrap_or(None)
                .unwrap_or_else(|| "simple".to_string());
            if mode == "simple" {
                let simple_cfg = crate::simple_config::get_saved_simple_config(&conn);
                (
                    Some(simple_cfg.log.level),
                    simple_cfg.log.disabled,
                    if simple_cfg.log.output.trim().is_empty() {
                        None
                    } else {
                        Some(simple_cfg.log.output)
                    },
                )
            } else {
                let running_id_str = crate::db::get_setting(&conn, "running_config_id")
                    .unwrap_or(None)
                    .unwrap_or_default();
                if let Ok(id) = running_id_str.parse::<i64>()
                    && let Ok(Some(history)) = crate::db::get_config_history_detail(&conn, id)
                    && let Some(content_str) = history.content
                    && let Ok(c) = serde_json::from_str::<Value>(&content_str)
                {
                    let level = c
                        .get("log")
                        .and_then(|l| l.get("level"))
                        .and_then(|lv| lv.as_str())
                        .map(|s| s.to_lowercase());
                    let disabled = c
                        .get("log")
                        .and_then(|l| l.get("disabled"))
                        .and_then(|d| d.as_bool())
                        .unwrap_or(false);
                    let output = c
                        .get("log")
                        .and_then(|l| l.get("output"))
                        .and_then(|o| o.as_str())
                        .map(|s| s.to_string());
                    (level.or(Some("info".to_string())), disabled, output)
                } else if let Ok(Some(log_str)) = crate::db::get_base_config_section(&conn, "log")
                    && let Ok(c) = serde_json::from_str::<Value>(&log_str)
                {
                    let level = c
                        .get("level")
                        .and_then(|lv| lv.as_str())
                        .map(|s| s.to_lowercase());
                    let disabled = c.get("disabled").and_then(|d| d.as_bool()).unwrap_or(false);
                    let output = c
                        .get("output")
                        .and_then(|o| o.as_str())
                        .map(|s| s.to_string());
                    (level.or(Some("info".to_string())), disabled, output)
                } else {
                    (Some("info".to_string()), false, None)
                }
            }
        } else {
            (Some("info".to_string()), false, None)
        };

        ServiceStatusInfo {
            running: is_run,
            ready: is_ready,
            pid,
            started_at,
            uptime_secs,
            last_error,
            binary_path,
            config_path,
            inbounds_summary,
            is_tun,
            conflicting_processes,
            log_level,
            log_disabled,
            log_output,
        }
    }

    pub async fn start(&self, config_json: &Value) -> Result<()> {
        self.start_with_sudo(config_json, None).await
    }

    pub async fn start_with_sudo(
        &self,
        config_json: &Value,
        sudo_pass: Option<&str>,
    ) -> Result<()> {
        self.start_with_sudo_and_takeover(config_json, sudo_pass, false)
            .await
    }

    pub async fn takeover_and_start(
        &self,
        config_json: &Value,
        sudo_pass: Option<&str>,
    ) -> Result<()> {
        self.start_with_sudo_and_takeover(config_json, sudo_pass, true)
            .await
    }

    pub async fn takeover_external_processes(&self, sudo_pass: Option<&str>) -> Result<()> {
        let conflicts = self.find_external_singbox_processes().await;
        if conflicts.is_empty() {
            return Ok(());
        }

        self.append_log(&format!(
            "正在执行一键接管，正在终止/禁用外部 sing-box 进程 (共 {} 个)...",
            conflicts.len()
        ))
        .await;

        for proc in conflicts {
            self.kill_external_process(proc.pid, sudo_pass).await?;
        }

        let remaining = self.find_external_singbox_processes().await;
        if !remaining.is_empty() {
            let pids: Vec<String> = remaining.iter().map(|c| c.pid.to_string()).collect();
            let msg = format!(
                "接管未完全成功：仍有外部 sing-box 进程在运行 (PID: {})",
                pids.join(", ")
            );
            self.append_log(&format!("❌ {}", msg)).await;
            return Err(anyhow!(msg));
        }

        self.append_log("🟢 已成功接管外部服务并禁用系统开机争抢")
            .await;
        Ok(())
    }

    pub async fn start_with_sudo_and_takeover(
        &self,
        config_json: &Value,
        sudo_pass: Option<&str>,
        takeover: bool,
    ) -> Result<()> {
        let singbox_bin = kernel::get_singbox_executable()
            .ok_or_else(|| anyhow!("未找到 sing-box 可执行文件，请先在面板下载集成内核"))?;

        let explicit_pass = sudo_pass.and_then(|p| {
            let trimmed = p.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        });

        if let Some(ref p) = explicit_pass {
            *self.cached_sudo_pass.write().await = Some(p.clone());
        }

        // 1. Detect or take over conflicting external sing-box processes before we replace
        // the running configuration. The currently managed child is excluded from this list.
        if takeover {
            self.takeover_external_processes(sudo_pass).await?;
        } else {
            let conflicts = self.find_external_singbox_processes().await;
            if !conflicts.is_empty() {
                let pids: Vec<String> = conflicts.iter().map(|c| c.pid.to_string()).collect();
                let details = conflicts
                    .iter()
                    .map(|c| {
                        format!(
                            "PID: {} ({})",
                            c.pid,
                            c.cmdline.as_deref().unwrap_or(&c.name)
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("; ");
                let err_msg = format!(
                    "检测到系统中已有外部独立的 sing-box 服务正在运行 [{}]。请先在系统终端中关闭现有外部服务（如 sudo systemctl stop sing-box && sudo systemctl disable sing-box 或 kill {}），或点击【一键接管】由 Subout 托管启动服务。",
                    details,
                    pids.join(" ")
                );
                self.append_log(&format!("❌ {}", err_msg)).await;
                *self.last_error.write().await = Some(err_msg.clone());
                return Err(anyhow!(err_msg));
            }
        }

        let paths = crate::paths::AppPaths::get();
        let _ = paths.ensure_dirs();

        let log_disabled = config_json
            .get("log")
            .and_then(|l| l.get("disabled"))
            .and_then(|d| d.as_bool())
            .unwrap_or(false);

        let configured_level_str = config_json
            .get("log")
            .and_then(|l| l.get("level"))
            .and_then(|lv| lv.as_str())
            .unwrap_or("info");
        let configured_level =
            SingboxLogLevel::parse(configured_level_str).unwrap_or(SingboxLogLevel::Info);

        let log_output_file: Option<PathBuf> = config_json
            .get("log")
            .and_then(|l| l.get("output"))
            .and_then(|o| o.as_str())
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| {
                let path = PathBuf::from(s);
                if path.is_absolute() {
                    path
                } else {
                    paths.log_dir.join(path)
                }
            });

        if let Some(ref out_path) = log_output_file
            && let Some(parent) = out_path.parent()
        {
            let _ = std::fs::create_dir_all(parent);
        }

        let mut final_config_json = config_json.clone();
        if let Some(ref out_path) = log_output_file
            && let Some(log_obj) = final_config_json
                .get_mut("log")
                .and_then(|l| l.as_object_mut())
        {
            log_obj.insert(
                "output".to_string(),
                serde_json::json!(out_path.to_string_lossy()),
            );
        }

        let tun_mode = is_tun_mode(&final_config_json);
        let clash_api_config = prepare_audit_runtime_config(&mut final_config_json, tun_mode);
        let as_root = is_running_as_root();
        let platform = crate::platform::current_platform();

        if windows_tun_requires_elevation(platform.is_windows(), tun_mode, as_root) {
            let err_msg = "Windows TUN 模式需要以管理员身份运行 Subout。请关闭当前程序，右键选择“以管理员身份运行”后重试；非 TUN 配置可在不提权的情况下启动。".to_string();
            self.append_log(&format!("❌ {}", err_msg)).await;
            *self.last_error.write().await = Some(err_msg.clone());
            return Err(anyhow!(err_msg));
        }

        if let Err(err_msg) = validate_runtime_config(&singbox_bin, &final_config_json) {
            self.append_log(&format!("❌ {}", err_msg)).await;
            *self.last_error.write().await = Some(err_msg.clone());
            return Err(anyhow!(err_msg));
        }

        // 2. The new configuration is valid, so it is now safe to stop the existing
        // managed process and replace its runtime configuration.
        self.stop().await?;

        let config_path = Self::get_running_config_path();
        if let Some(parent) = config_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let config_str = serde_json::to_string_pretty(&final_config_json)?;

        // 3. Write config file
        std::fs::write(&config_path, &config_str)
            .map_err(|e| anyhow!("写入 sing-box 运行配置文件失败: {}", e))?;

        let explicit_pass = sudo_pass.and_then(|p| {
            let trimmed = p.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        });

        if let Some(ref p) = explicit_pass {
            self.save_sudo_pass(p).await;
        }

        let cached_pass = self.cached_sudo_pass.read().await.clone();
        let effective_sudo_pass = explicit_pass.or(cached_pass);
        let has_sudo_pass = effective_sudo_pass.is_some();
        let use_sudo = !platform.is_windows() && !as_root && has_sudo_pass;

        if use_sudo {
            self.append_log(&format!(
                "正在使用 Sudo 提权启动 sing-box 服务 (TUN 模式: {}, 内核: {})...",
                tun_mode,
                singbox_bin.display()
            ))
            .await;
        } else {
            self.append_log(&format!(
                "正在启动 sing-box 服务 (TUN 模式: {}, root: {}, 内核: {})...",
                tun_mode,
                as_root,
                singbox_bin.display()
            ))
            .await;
        }

        let abs_data_dir = paths.absolute_data_dir();

        let abs_config_path = std::fs::canonicalize(&config_path).unwrap_or_else(|_| {
            if config_path.is_absolute() {
                config_path.clone()
            } else if let Ok(cwd) = std::env::current_dir() {
                cwd.join(&config_path)
            } else {
                config_path.clone()
            }
        });

        let mut cmd = if use_sudo {
            let mut c = tokio::process::Command::new("sudo");
            c.arg("-S")
                .arg("-k")
                .arg("-p")
                .arg("")
                .arg("--")
                .arg(&singbox_bin)
                .arg("-D")
                .arg(&abs_data_dir)
                .arg("run")
                .arg("-c")
                .arg(&abs_config_path);
            c.stdin(Stdio::piped());
            c
        } else {
            let mut c = tokio::process::Command::new(&singbox_bin);
            c.arg("-D")
                .arg(&abs_data_dir)
                .arg("run")
                .arg("-c")
                .arg(&abs_config_path);
            c
        };

        cmd.env("ENABLE_DEPRECATED_LEGACY_DNS_SERVERS", "true")
            .env("ENABLE_DEPRECATED_MISSING_DOMAIN_RESOLVER", "true")
            .env("ENABLE_DEPRECATED_OUTBOUND_DNS_RULE_ITEM", "true")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        cmd.kill_on_drop(true);

        platform.setup_child_process(&mut cmd);

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let err_msg = format!("启动 sing-box 进程失败: {}", e);
                self.append_log(&format!("❌ {}", err_msg)).await;
                *self.last_error.write().await = Some(err_msg.clone());
                return Err(anyhow!(err_msg));
            }
        };

        if use_sudo
            && let Some(ref pass) = effective_sudo_pass
            && let Some(mut stdin) = child.stdin.take()
        {
            use tokio::io::AsyncWriteExt;
            let pass_bytes = format!("{}\n", pass);
            let _ = stdin.write_all(pass_bytes.as_bytes()).await;
            let _ = stdin.flush().await;
            drop(stdin); // Explicitly close stdin to prevent sudo from waiting for more input
        }

        let pid = child.id();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        *self.started_at.write().await = Some(now);
        *self.ready.write().await = false;
        *self.last_error.write().await = None;
        *self.current_log_level.write().await = configured_level.as_str().to_string();
        *self.current_log_disabled.write().await = log_disabled;
        *self.current_log_output.write().await = log_output_file
            .as_ref()
            .map(|p| p.to_string_lossy().to_string());
        *self.clash_api.write().await = clash_api_config;
        *self.audit_outbound_cache.write().await = None;
        *self.audit_tun_active.write().await = tun_mode;
        self.refresh_audit_node_subscription_labels().await;
        self.sync_audit_recording_state().await;

        self.stop_audit_worker().await;
        self.audit_queue_dropped.store(0, Ordering::Relaxed);
        let (audit_sender, mut audit_receiver) = mpsc::channel(AUDIT_QUEUE_CAPACITY);
        *self.audit_queue.write().await = Some(audit_sender.clone());
        let audit_worker = self.audit.clone();
        let clash_api_worker = self.clash_api.clone();
        let node_subscription_labels_worker = self.node_subscription_labels.clone();
        let audit_outbound_cache_worker = self.audit_outbound_cache.clone();
        let audit_queue_generation_worker = self.audit_queue_generation.clone();
        let worker = tokio::spawn(async move {
            let mut line_deduplicator = AuditLineDeduplicator::new();
            while let Some(queued_line) = audit_receiver.recv().await {
                if !line_deduplicator.should_ingest(&queued_line.line) {
                    continue;
                }
                ingest_audit_line(
                    audit_worker.clone(),
                    clash_api_worker.clone(),
                    node_subscription_labels_worker.clone(),
                    audit_outbound_cache_worker.clone(),
                    audit_queue_generation_worker.clone(),
                    queued_line.generation,
                    &queued_line.line,
                )
                .await;
            }
        });
        *self.audit_worker.lock().await = Some(worker);

        let min_level = configured_level;
        let is_disabled = log_disabled;
        let subout_log_path = paths.log_dir.join("subout.log");

        // Pipe stdout
        if let Some(stdout) = child.stdout.take() {
            let logs_clone = self.logs.clone();
            let last_error_clone = self.last_error.clone();
            let ready_clone = self.ready.clone();
            let subout_log_file = subout_log_path.clone();
            let audit_sender = audit_sender.clone();
            let audit_queue_dropped = self.audit_queue_dropped.clone();
            let audit_queue_generation = self.audit_queue_generation.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let clean = strip_ansi_codes(&line);
                    enqueue_audit_line(
                        &audit_sender,
                        &audit_queue_generation,
                        &audit_queue_dropped,
                        &clean,
                    );
                    if is_actual_singbox_error(&clean) {
                        *last_error_clone.write().await = Some(clean.clone());
                    } else {
                        let lower = clean.to_lowercase();
                        if lower.contains("sing-box started")
                            || lower.contains("server started at")
                            || lower.contains("started inbound")
                            || lower.contains(": started")
                            || lower.contains("router: started")
                            || lower.contains("dns: started")
                        {
                            *ready_clone.write().await = true;
                        }
                    }

                    if should_record_singbox_line(&clean, min_level, is_disabled) {
                        let timestamp =
                            chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
                        let formatted = format!("[{}] [sing-box] {}", timestamp, clean);
                        {
                            let mut l = logs_clone.write().await;
                            if l.len() >= MAX_LOG_LINES {
                                l.pop_front();
                            }
                            l.push_back(formatted.clone());
                        }
                        append_to_file(&subout_log_file, &formatted).await;
                    }
                }
            });
        }

        // Pipe stderr (sing-box sends its standard formatted console logs to stderr)
        if let Some(stderr) = child.stderr.take() {
            let logs_clone = self.logs.clone();
            let last_error_clone = self.last_error.clone();
            let ready_clone = self.ready.clone();
            let subout_log_file = subout_log_path.clone();
            let audit_sender = audit_sender.clone();
            let audit_queue_dropped = self.audit_queue_dropped.clone();
            let audit_queue_generation = self.audit_queue_generation.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let clean = strip_ansi_codes(&line);
                    enqueue_audit_line(
                        &audit_sender,
                        &audit_queue_generation,
                        &audit_queue_dropped,
                        &clean,
                    );
                    if is_actual_singbox_error(&clean) {
                        *last_error_clone.write().await = Some(clean.clone());
                    } else {
                        let lower = clean.to_lowercase();
                        if lower.contains("sing-box started")
                            || lower.contains("server started at")
                            || lower.contains("started inbound")
                            || lower.contains(": started")
                            || lower.contains("router: started")
                            || lower.contains("dns: started")
                        {
                            *ready_clone.write().await = true;
                        }
                    }

                    if should_record_singbox_line(&clean, min_level, is_disabled) {
                        let timestamp =
                            chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
                        let formatted = format!("[{}] [sing-box] {}", timestamp, clean);
                        {
                            let mut l = logs_clone.write().await;
                            if l.len() >= MAX_LOG_LINES {
                                l.pop_front();
                            }
                            l.push_back(formatted.clone());
                        }
                        append_to_file(&subout_log_file, &formatted).await;
                    }
                }
            });
        }

        // Pipe log file if configured in sing-box config
        if let Some(output_path) = log_output_file {
            let logs_clone = self.logs.clone();
            let last_error_clone = self.last_error.clone();
            let ready_clone = self.ready.clone();
            let is_running_child = self.child.clone();
            let subout_log_file = subout_log_path.clone();
            let audit_sender = audit_sender.clone();
            let audit_queue_dropped = self.audit_queue_dropped.clone();
            let audit_queue_generation = self.audit_queue_generation.clone();
            tokio::spawn(async move {
                // Wait up to 5s for sing-box to create the log file
                let mut file = None;
                for _ in 0..100 {
                    if let Ok(f) = tokio::fs::File::open(&output_path).await {
                        file = Some(f);
                        break;
                    }
                    tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
                }

                if let Some(f) = file {
                    let mut reader = BufReader::new(f);
                    let mut line_buf = String::new();
                    loop {
                        let still_running = {
                            let mut c = is_running_child.write().await;
                            if let Some(ref mut child) = *c {
                                matches!(child.try_wait(), Ok(None))
                            } else {
                                false
                            }
                        };

                        let mut read_any = false;
                        loop {
                            line_buf.clear();
                            match reader.read_line(&mut line_buf).await {
                                Ok(0) | Err(_) => break,
                                Ok(_) => {
                                    read_any = true;
                                    let trimmed = line_buf.trim_end_matches(&['\r', '\n'][..]);
                                    if !trimmed.is_empty() {
                                        let clean = strip_ansi_codes(trimmed);
                                        enqueue_audit_line(
                                            &audit_sender,
                                            &audit_queue_generation,
                                            &audit_queue_dropped,
                                            &clean,
                                        );
                                        if is_actual_singbox_error(&clean) {
                                            *last_error_clone.write().await = Some(clean.clone());
                                        } else {
                                            let lower = clean.to_lowercase();
                                            if lower.contains("sing-box started")
                                                || lower.contains("server started at")
                                                || lower.contains("started inbound")
                                                || lower.contains(": started")
                                                || lower.contains("router: started")
                                                || lower.contains("dns: started")
                                            {
                                                *ready_clone.write().await = true;
                                            }
                                        }

                                        if should_record_singbox_line(
                                            &clean,
                                            min_level,
                                            is_disabled,
                                        ) {
                                            let timestamp = chrono::Local::now()
                                                .format("%Y-%m-%d %H:%M:%S")
                                                .to_string();
                                            let formatted =
                                                format!("[{}] [sing-box] {}", timestamp, clean);

                                            {
                                                let mut l = logs_clone.write().await;
                                                if l.len() >= MAX_LOG_LINES {
                                                    l.pop_front();
                                                }
                                                l.push_back(formatted.clone());
                                            }
                                            append_to_file(&subout_log_file, &formatted).await;
                                        }
                                    }
                                }
                            }
                        }

                        if !still_running && !read_any {
                            break;
                        }

                        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                    }
                }
            });
        }

        *self.child.write().await = Some(child);
        // Record the PID independently of the Child handle. This lets status
        // polling continue to report the real Windows process even if Tokio's
        // handle is later unavailable.
        *self.managed_pid.write().await = pid;

        // Wait up to 3000ms for sing-box to initialize and report ready or exit
        let mut started_ready = false;
        for _ in 0..60 {
            tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
            if !self.is_running().await {
                break;
            }
            if *self.ready.read().await {
                started_ready = true;
                break;
            }
        }

        let is_running_after_startup = self.is_running().await;
        let startup_error = self.last_error.read().await.clone();
        if startup_error_requires_cleanup(is_running_after_startup, startup_error.as_deref()) {
            let err = startup_error.expect("startup error is present when cleanup is required");
            self.append_log(&format!(
                "❌ sing-box 启动期间报告致命错误，正在清理进程: {}",
                err
            ))
            .await;
            self.stop().await?;
            *self.last_error.write().await = Some(err.clone());
            return Err(anyhow!("sing-box 启动异常: {}", err));
        }

        if is_running_after_startup {
            *self.ready.write().await = true;
            started_ready = true;
        }

        if !self.is_running().await {
            let err = self
                .last_error
                .read()
                .await
                .clone()
                .unwrap_or_else(|| "sing-box 启动后立即退出，请检查配置或核心日志".to_string());
            let err_upper = err.to_uppercase();
            if err_upper.contains("INCORRECT PASSWORD")
                || err_upper.contains("AUTHENTICATION FAILURE")
                || err_upper.contains("SORRY, TRY AGAIN")
                || err_upper.contains("1 INCORRECT PASSWORD ATTEMPT")
                || err_upper.contains("A PASSWORD IS REQUIRED")
            {
                self.clear_saved_sudo_pass().await;
                let guide =
                    "Sudo 密码不正确或已失效，请重新输入系统管理员密码进行授权。".to_string();
                self.append_log(&format!("❌ {}", guide)).await;
                *self.last_error.write().await = Some(guide.clone());
                return Err(anyhow!(guide));
            }

            let is_permission_err = err_upper.contains("TUNSETIFF")
                || err_upper.contains("OPERATION NOT PERMITTED")
                || err_upper.contains("PERMISSION DENIED")
                || err_upper.contains("WINTUN")
                || err_upper.contains("ACCESS IS DENIED")
                || err_upper.contains("REQUIRES ROOT")
                || err_upper.contains("REQUIRE ROOT")
                || err_upper.contains("MUST BE ROOT");

            if is_permission_err && !as_root && !has_sudo_pass {
                let guide = platform.tun_permission_error_guide(&err, &singbox_bin);
                self.append_log(&format!("❌ {}", guide)).await;
                *self.last_error.write().await = Some(guide.clone());
                return Err(anyhow!(guide));
            }
            self.append_log(&format!("❌ sing-box 启动失败: {}", err))
                .await;
            *self.last_error.write().await = Some(err.clone());
            return Err(anyhow!("sing-box 启动异常: {}", err));
        }

        if let Some(ref p) = effective_sudo_pass {
            self.save_sudo_pass(p).await;
        }

        let cached_pass = self.cached_sudo_pass.read().await.clone();
        if let Some(port) = get_mixed_port_from_config(config_json) {
            platform.enable_system_proxy(port, cached_pass.as_deref());
            if platform.is_linux() || platform.is_macos() || platform.is_windows() {
                self.append_log(&format!("🌐 已自动设置系统网络代理 (127.0.0.1:{})", port))
                    .await;
            }
        }
        if tun_mode {
            let tun_ip =
                get_tun_ip_from_config(config_json).unwrap_or_else(|| "172.19.0.1".to_string());
            platform.enable_tun_dns(&tun_ip, cached_pass.as_deref());
            if platform.is_macos() {
                self.append_log(&format!(
                    "🌐 已自动设置 macOS 系统 DNS 指向 TUN 虚拟网卡 ({})",
                    tun_ip
                ))
                .await;
            }
        }

        let summary = get_inbounds_summary_from_config(&config_path);
        if let Some(s) = summary {
            self.append_log(&format!(
                "🟢 sing-box 服务已就绪并开始运行 (PID: {:?}, 入站: {})",
                pid, s
            ))
            .await;
        } else if started_ready {
            self.append_log(&format!(
                "🟢 sing-box 服务已就绪并开始运行 (PID: {:?})",
                pid
            ))
            .await;
        } else {
            self.append_log(&format!("🟢 sing-box 进程已拉起 (PID: {:?})", pid))
                .await;
        }

        Ok(())
    }

    pub async fn stop(&self) -> Result<()> {
        // Take the handle before awaiting process operations. Holding the
        // child lock while taskkill/PowerShell runs used to make concurrent
        // status requests queue behind stop/restart and occasionally render a
        // stale state after a page refresh.
        self.stop_audit_worker().await;
        let child_opt = self.child.write().await.take();
        let mut had_child = false;
        let mut pid_opt = *self.managed_pid.read().await;
        let platform = crate::platform::current_platform();

        if let Some(mut child) = child_opt {
            had_child = true;
            pid_opt = child.id().or(pid_opt);
            self.append_log("正在停止 sing-box 服务...").await;

            let _ = child.start_kill();

            let cached_pass = self.cached_sudo_pass.read().await.clone();

            if let Some(pid) = pid_opt {
                platform.kill_process(pid, cached_pass.as_deref(), 15).await;
            }

            // Wait up to 500ms for graceful stop, otherwise force SIGKILL
            if (tokio::time::timeout(std::time::Duration::from_millis(500), child.wait()).await)
                .is_err()
            {
                if let Some(pid) = pid_opt {
                    platform.kill_process(pid, cached_pass.as_deref(), 9).await;
                }
                let _ =
                    tokio::time::timeout(std::time::Duration::from_millis(200), child.wait()).await;
            }
        }

        let cached_pass = self.cached_sudo_pass.read().await.clone();
        // Clean up any lingering Subout sing-box / sudo child processes
        platform
            .kill_all_subout_processes(
                cached_pass.as_deref(),
                pid_opt,
                &Self::get_running_config_path(),
            )
            .await;

        // Do not claim a successful stop until Windows/Linux confirms the
        // actual managed PID is gone. In particular, an unelevated panel can
        // fail to kill an elevated TUN core; reporting "stopped" in that case
        // would leave the dashboard and the real proxy process inconsistent.
        if let Some(pid) = pid_opt {
            for _ in 0..10 {
                if !platform.is_pid_alive(pid) {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
            if platform.is_pid_alive(pid) {
                *self.managed_pid.write().await = Some(pid);
                *self.ready.write().await = true;
                let message = format!(
                    "sing-box 进程 (PID: {}) 仍在运行，停止操作未完成；请以管理员身份运行 Subout 后重试。",
                    pid
                );
                *self.last_error.write().await = Some(message.clone());
                self.append_log(&format!("❌ {}", message)).await;
                return Err(anyhow!(message));
            }
        }

        platform.disable_system_proxy(cached_pass.as_deref());
        platform.disable_tun_dns(cached_pass.as_deref());
        if platform.is_linux() || platform.is_macos() || platform.is_windows() {
            self.append_log("🌐 已恢复系统原始网络代理设置").await;
        }

        if had_child || pid_opt.is_some() {
            self.append_log("⏹️ sing-box 服务已停止").await;
        }

        *self.managed_pid.write().await = None;
        *self.conflict_cache.write().await = None;
        *self.started_at.write().await = None;
        *self.ready.write().await = false;
        *self.last_error.write().await = None;
        *self.clash_api.write().await = None;
        *self.audit_outbound_cache.write().await = None;
        *self.audit_tun_active.write().await = false;
        self.sync_audit_recording_state().await;
        Ok(())
    }

    pub async fn kill_external_process(&self, pid: u32, sudo_pass: Option<&str>) -> Result<()> {
        let current_pid = std::process::id();
        if pid == current_pid || pid <= 1 {
            return Err(anyhow!("无法终止受保护的系统进程 (PID: {})", pid));
        }

        let platform = crate::platform::current_platform();

        let conflicts = self.find_external_singbox_processes().await;
        if !is_authorized_external_process_pid(&conflicts, pid) {
            return Err(anyhow!("拒绝终止未被识别为 sing-box 的进程 (PID: {})", pid));
        }

        if !platform.is_pid_alive(pid) {
            self.append_log(&format!("外部进程 (PID: {}) 已不再运行", pid))
                .await;
            return Ok(());
        }

        self.append_log(&format!("正在请求终止外部 sing-box 进程 (PID: {})...", pid))
            .await;

        let cached_pass = self.cached_sudo_pass.read().await.clone();
        let pass_clean = sudo_pass
            .map(|p| p.trim())
            .filter(|p| !p.is_empty())
            .map(|p| p.to_string())
            .or(cached_pass);

        if let Err(e) = platform
            .stop_external_service_or_process(pid, pass_clean.as_deref())
            .await
            && e.to_string().contains("Sudo 密码不正确")
        {
            self.clear_saved_sudo_pass().await;
            self.append_log(&format!("❌ 终止外部进程失败: {}", e))
                .await;
            return Err(e);
        }

        // Verify whether the process has terminated
        let mut is_dead = false;
        for _ in 0..15 {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            if !platform.is_pid_alive(pid) {
                is_dead = true;
                break;
            }
        }

        if !is_dead {
            let msg = platform.external_process_stop_failed_message(pid, pass_clean.is_some());
            self.append_log(&format!("❌ {}", msg)).await;
            return Err(anyhow!(msg));
        }

        if let Some(ref pass) = pass_clean {
            self.save_sudo_pass(pass).await;
        }

        self.append_log(&format!("🟢 已成功终止外部 sing-box 进程 (PID: {})", pid))
            .await;
        Ok(())
    }

    pub async fn restart(&self, config_json: &Value) -> Result<()> {
        self.restart_with_sudo(config_json, None).await
    }

    pub async fn restart_with_sudo(
        &self,
        config_json: &Value,
        sudo_pass: Option<&str>,
    ) -> Result<()> {
        self.restart_with_sudo_and_takeover(config_json, sudo_pass, false)
            .await
    }

    pub async fn restart_with_sudo_and_takeover(
        &self,
        config_json: &Value,
        sudo_pass: Option<&str>,
        takeover: bool,
    ) -> Result<()> {
        self.stop().await?;
        self.start_with_sudo_and_takeover(config_json, sudo_pass, takeover)
            .await
    }
}

pub fn is_running_as_root() -> bool {
    crate::platform::current_platform().is_running_as_root()
}

pub fn is_tun_mode(config_json: &Value) -> bool {
    if let Some(inbounds) = config_json.get("inbounds").and_then(|v| v.as_array()) {
        for inb in inbounds {
            if inb.get("type").and_then(|t| t.as_str()) == Some("tun") {
                return true;
            }
        }
    }
    false
}

fn prepare_audit_runtime_config(config: &mut Value, tun_mode: bool) -> Option<ClashApiConfig> {
    if !tun_mode {
        return None;
    }

    if let Some(route) = config.get_mut("route").and_then(Value::as_object_mut) {
        route.insert("find_process".to_string(), serde_json::json!(true));
    } else {
        config["route"] = serde_json::json!({"find_process": true});
    }

    if !config.get("experimental").is_some_and(Value::is_object) {
        config["experimental"] = serde_json::json!({});
    }
    let experimental = config
        .get_mut("experimental")
        .and_then(Value::as_object_mut)
        .expect("experimental object inserted");
    if experimental
        .get("clash_api")
        .and_then(Value::as_object)
        .is_some_and(serde_json::Map::is_empty)
    {
        return None;
    }
    let clash_api = experimental
        .entry("clash_api")
        .or_insert_with(|| serde_json::json!({}))
        .as_object_mut()?;

    let existing_controller = clash_api
        .get("external_controller")
        .and_then(Value::as_str)
        .and_then(parse_loopback_controller);
    let (host, port) = match existing_controller {
        Some(controller) => controller,
        None => {
            let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).ok()?;
            let port = listener.local_addr().ok()?.port();
            drop(listener);
            ("127.0.0.1".to_string(), port)
        }
    };
    let secret = clash_api
        .get("secret")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|secret| !secret.is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(generate_local_api_secret);
    clash_api.insert(
        "external_controller".to_string(),
        serde_json::json!(format!("{}:{}", host, port)),
    );
    clash_api.insert("secret".to_string(), serde_json::json!(secret.clone()));

    Some(ClashApiConfig {
        base_url: format!("http://{}:{}", host, port),
        secret,
    })
}

fn parse_loopback_controller(value: &str) -> Option<(String, u16)> {
    let (host, port) = value.rsplit_once(':')?;
    let host = host.trim().trim_matches(['[', ']']);
    if !matches!(host, "127.0.0.1" | "localhost" | "::1") {
        return None;
    }
    Some(("127.0.0.1".to_string(), port.parse().ok()?))
}

fn generate_local_api_secret() -> String {
    let mut hasher = Sha256::new();
    hasher.update(std::process::id().to_le_bytes());
    hasher.update(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
            .to_le_bytes(),
    );
    format!("{:x}", hasher.finalize())
}

fn windows_tun_requires_elevation(is_windows: bool, tun_mode: bool, is_elevated: bool) -> bool {
    is_windows && tun_mode && !is_elevated
}

fn startup_error_requires_cleanup(is_running: bool, startup_error: Option<&str>) -> bool {
    is_running && startup_error.is_some()
}

fn validate_runtime_config(singbox_bin: &Path, config: &Value) -> Result<(), String> {
    let temp_file_path =
        crate::paths::AppPaths::get().temp_file_path("singbox_start_check", ".json");
    let config_str = serde_json::to_string_pretty(config)
        .map_err(|err| format!("启动前配置序列化失败: {}", err))?;

    std::fs::write(&temp_file_path, config_str)
        .map_err(|err| format!("启动前写入配置校验文件失败: {}", err))?;
    let abs_temp_file_path =
        std::fs::canonicalize(&temp_file_path).unwrap_or_else(|_| temp_file_path.clone());

    let output = std::process::Command::new(singbox_bin)
        .arg("-D")
        .arg(crate::paths::AppPaths::get().absolute_data_dir())
        .args(["check", "-c"])
        .arg(&abs_temp_file_path)
        .env("ENABLE_DEPRECATED_LEGACY_DNS_SERVERS", "true")
        .env("ENABLE_DEPRECATED_MISSING_DOMAIN_RESOLVER", "true")
        .env("ENABLE_DEPRECATED_OUTBOUND_DNS_RULE_ITEM", "true")
        .output();
    let _ = std::fs::remove_file(&temp_file_path);

    match output {
        Ok(output) if output.status.success() => Ok(()),
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let details = if stderr.is_empty() { stdout } else { stderr };
            Err(format!(
                "sing-box 启动前配置校验失败{}",
                if details.is_empty() {
                    format!("（退出码：{}）", output.status)
                } else {
                    format!("：{}", details)
                }
            ))
        }
        Err(err) => Err(format!("执行 sing-box 启动前配置校验失败: {}", err)),
    }
}

pub async fn kill_all_subout_singbox_processes(
    cached_sudo_pass: Option<&str>,
    exclude_pid: Option<u32>,
) {
    crate::platform::current_platform()
        .kill_all_subout_processes(
            cached_sudo_pass,
            exclude_pid,
            &SingBoxServiceManager::get_running_config_path(),
        )
        .await;
}

pub fn detect_conflicting_singbox_processes(
    managed_pid: Option<u32>,
) -> Vec<ConflictingProcessInfo> {
    crate::platform::current_platform().detect_conflicting_processes(
        managed_pid,
        &SingBoxServiceManager::get_running_config_path(),
    )
}

pub fn is_authorized_external_process_pid(conflicts: &[ConflictingProcessInfo], pid: u32) -> bool {
    conflicts.iter().any(|process| process.pid == pid)
}

pub fn get_inbounds_summary_from_config(config_path: &std::path::Path) -> Option<String> {
    if let Ok(content) = std::fs::read_to_string(config_path)
        && let Ok(json_val) = serde_json::from_str::<Value>(&content)
        && let Some(inbounds) = json_val.get("inbounds").and_then(|v| v.as_array())
    {
        let mut summaries = Vec::new();
        for inb in inbounds {
            let inb_type = inb.get("type").and_then(|t| t.as_str()).unwrap_or("mixed");
            match inb_type {
                "tun" => {
                    let iface = inb
                        .get("interface_name")
                        .and_then(|i| i.as_str())
                        .unwrap_or("");
                    if iface.is_empty() {
                        summaries.push("TUN".to_string());
                    } else {
                        summaries.push(format!("TUN ({})", iface));
                    }
                }
                "mixed" => {
                    let listen = inb
                        .get("listen")
                        .and_then(|l| l.as_str())
                        .unwrap_or("127.0.0.1");
                    let port = inb
                        .get("listen_port")
                        .and_then(|p| p.as_u64())
                        .unwrap_or(2080);
                    summaries.push(format!("{}:{} (混合代理)", listen, port));
                }
                "http" => {
                    let port = inb
                        .get("listen_port")
                        .and_then(|p| p.as_u64())
                        .unwrap_or(8080);
                    summaries.push(format!("HTTP :{}", port));
                }
                "socks" => {
                    let port = inb
                        .get("listen_port")
                        .and_then(|p| p.as_u64())
                        .unwrap_or(1080);
                    summaries.push(format!("SOCKS5 :{}", port));
                }
                other => {
                    summaries.push(format!("入站 ({})", other));
                }
            }
        }
        if !summaries.is_empty() {
            return Some(summaries.join(", "));
        }
    }
    None
}

pub fn is_pid_alive(pid: u32) -> bool {
    crate::platform::current_platform().is_pid_alive(pid)
}

pub async fn run_sudo_command(
    cmd_name: &str,
    args: &[&str],
    sudo_pass: Option<&str>,
) -> Result<()> {
    crate::platform::current_platform()
        .run_sudo_command(cmd_name, args, sudo_pass)
        .await
}

pub fn get_mixed_port_from_config(config: &Value) -> Option<u16> {
    if let Some(inbounds) = config.get("inbounds").and_then(|i| i.as_array()) {
        for inbound in inbounds {
            let inbound_type = inbound.get("type").and_then(|t| t.as_str());
            if matches!(inbound_type, Some("mixed") | Some("http") | Some("socks"))
                && let Some(port) = inbound.get("listen_port").and_then(|p| p.as_u64())
            {
                return Some(port as u16);
            }
        }
    }
    None
}

pub fn get_tun_ip_from_config(config: &Value) -> Option<String> {
    if let Some(inbounds) = config.get("inbounds").and_then(|i| i.as_array()) {
        for inbound in inbounds {
            if inbound.get("type").and_then(|t| t.as_str()) == Some("tun") {
                if let Some(addrs) = inbound.get("address").and_then(|a| a.as_array()) {
                    for addr in addrs {
                        if let Some(s) = addr.as_str()
                            && !s.contains(':')
                        {
                            let ip = s.split('/').next().unwrap_or(s);
                            return Some(ip.to_string());
                        }
                    }
                }
                return Some("172.19.0.1".to_string());
            }
        }
    }
    None
}

pub fn strip_ansi_codes(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b'
            && let Some(&'[') = chars.peek()
        {
            chars.next(); // consume '['
            while let Some(&next_c) = chars.peek() {
                chars.next();
                if next_c.is_ascii_alphabetic() || next_c == '@' {
                    break;
                }
            }
            continue;
        }
        out.push(c);
    }
    out
}

pub fn is_actual_singbox_error(line: &str) -> bool {
    let upper = line.to_uppercase();

    // 1. Exclude all runtime proxy traffic / connection level error logs
    // These are normal network events during proxy operation, NOT core service crashes/failures.
    if upper.contains("CONNECTION:")
        || upper.contains("CONNECT: CONNECTION REFUSED")
        || upper.contains("CONNECT: NETWORK IS UNREACHABLE")
        || upper.contains("CONNECT: HOST IS DOWN")
        || upper.contains("CONNECT: NO ROUTE TO HOST")
        || upper.contains("DIAL TCP")
        || upper.contains("DIAL UDP")
        || upper.contains("I/O TIMEOUT")
        || upper.contains("IO TIMEOUT")
        || upper.contains("DEADLINE EXCEEDED")
        || upper.contains("CONNECTION RESET")
        || upper.contains("BROKEN PIPE")
        || upper.contains("HANDSHAKE FAILED")
        || upper.contains("EXCHANGE FAILED")
        || upper.contains("ROUTER: MATCH")
        || upper.contains("OUTBOUND/")
    {
        return false;
    }

    // 2. Fatal engine crashes, panics, configuration decode errors, and permission failures
    if upper.contains("FATAL")
        || upper.contains("PANIC")
        || upper.contains("ADDRESS ALREADY IN USE")
        || upper.contains("FAILED TO BIND")
        || upper.contains("OPERATION NOT PERMITTED")
        || upper.contains("PERMISSION DENIED")
        || upper.contains("TUNSETIFF")
        || upper.contains("ACCESS IS DENIED")
        || upper.contains("BAD TUN NAME")
        || upper.contains("INCORRECT PASSWORD")
        || upper.contains("AUTHENTICATION FAILURE")
        || upper.contains("A PASSWORD IS REQUIRED")
        || upper.contains("SORRY, TRY AGAIN")
        || upper.contains("CREATE SERVICE:")
        || upper.contains("START SERVICE:")
        || upper.contains("INVALID CONFIGURATION")
        || upper.contains("DECODE CONFIG")
    {
        return true;
    }

    // 3. Inbound server failure to listen / bind
    if upper.contains("INBOUND/")
        && (upper.contains("FAILED TO BIND")
            || upper.contains("BIND:")
            || upper.contains("LISTEN TCP")
            || upper.contains("LISTEN UDP"))
    {
        return true;
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_ansi_codes() {
        let raw = "\x1b[36mINFO\x1b[0m network: updated default interface wlo1, index 3";
        let clean = strip_ansi_codes(raw);
        assert_eq!(
            clean,
            "INFO network: updated default interface wlo1, index 3"
        );

        let colored_warn = "\x1b[33mWARN\x1b[0m outbound/direct[direct]: failed";
        assert_eq!(
            strip_ansi_codes(colored_warn),
            "WARN outbound/direct[direct]: failed"
        );
    }

    #[test]
    fn test_is_actual_singbox_error() {
        // Normal INFO lines should NOT be treated as error
        assert!(!is_actual_singbox_error(
            "INFO network: updated default interface"
        ));
        assert!(!is_actual_singbox_error(
            "INFO router: dns rule action predefined rcode NOERROR"
        ));
        assert!(!is_actual_singbox_error("INFO sing-box started (1.10s)"));
        assert!(!is_actual_singbox_error(
            "INFO[0000] inbound/tun[tun-in]: started"
        ));

        // Runtime proxy connection errors must NOT be treated as core service errors
        assert!(!is_actual_singbox_error(
            "+0800 2026-08-31 18:15:48 ERROR [2133602452 1.14s] connection: open connection to 192.168.3.80:39459 using outbound/direct[direct]: dial tcp 192.168.3.80:39459: connect: connection refused"
        ));
        assert!(!is_actual_singbox_error(
            "ERROR [760202674 10ms] connection: open connection to 192.168.3.80:39459 using outbound/direct[direct]: dial tcp 192.168.3.80:39459: connect: connection refused"
        ));
        assert!(!is_actual_singbox_error(
            "ERROR outbound/proxy[hk-01]: dial tcp 1.2.3.4:443: i/o timeout"
        ));
        assert!(!is_actual_singbox_error(
            "ERROR inbound/mixed[mixed-in]: connection: read: connection reset by peer"
        ));
        assert!(!is_actual_singbox_error(
            "ERROR dns: exchange failed for google.com: i/o timeout"
        ));

        // Genuine fatal or errors
        assert!(is_actual_singbox_error(
            "FATAL[0000] create service: rule-set error"
        ));
        assert!(is_actual_singbox_error(
            "FATAL[0002] start service: start logger: open /var/log/sing-box.log: The network path was not found."
        ));
        assert!(is_actual_singbox_error(
            "FATAL[0001] start service: start inbound/tun[tun-in]: configure tun interface: Access is denied."
        ));
        assert!(is_actual_singbox_error(
            "ERROR inbound/mixed[mixed-in]: tcp server failed to bind: address already in use"
        ));
        assert!(is_actual_singbox_error("panic: runtime error"));
        assert!(is_actual_singbox_error("operation not permitted"));
        assert!(is_actual_singbox_error(
            "FATAL[0000] start service: start inbound/tun[tun-in]: configure tun interface: open tun: TUNSETIFF: operation not permitted"
        ));
        assert!(is_actual_singbox_error(
            "sudo: 1 incorrect password attempt"
        ));
        assert!(is_actual_singbox_error(
            "sudo: pam_authenticate: Authentication failure"
        ));
    }

    #[test]
    fn test_is_tun_mode_detection() {
        let tun_cfg = serde_json::json!({
            "inbounds": [
                { "type": "mixed", "listen_port": 2080 },
                { "type": "tun", "interface_name": "tun0" }
            ]
        });
        assert!(is_tun_mode(&tun_cfg));

        let mixed_cfg = serde_json::json!({
            "inbounds": [
                { "type": "mixed", "listen_port": 2080 }
            ]
        });
        assert!(!is_tun_mode(&mixed_cfg));
    }

    #[test]
    fn test_windows_tun_requires_elevation_only_for_unelevated_tun_startup() {
        assert!(windows_tun_requires_elevation(true, true, false));
        assert!(!windows_tun_requires_elevation(true, true, true));
        assert!(!windows_tun_requires_elevation(true, false, false));
        assert!(!windows_tun_requires_elevation(false, true, false));
    }

    #[test]
    fn test_running_process_with_startup_error_is_not_reported_as_ready() {
        assert!(startup_error_requires_cleanup(
            true,
            Some("Access is denied")
        ));
        assert!(!startup_error_requires_cleanup(true, None));
        assert!(!startup_error_requires_cleanup(
            false,
            Some("Access is denied")
        ));
    }

    #[test]
    fn test_detect_conflicting_singbox_processes_excludes_self_and_managed() {
        let current_pid = std::process::id();
        let conflicts = detect_conflicting_singbox_processes(Some(current_pid));
        // Current test process must never be identified as an external conflict
        assert!(!conflicts.iter().any(|c| c.pid == current_pid));
        println!("Live detected conflicts in test: {:?}", conflicts);
    }

    #[test]
    fn test_service_status_info_serialization() {
        let status = ServiceStatusInfo {
            running: false,
            ready: false,
            pid: None,
            started_at: None,
            uptime_secs: None,
            last_error: None,
            binary_path: Some("/usr/bin/sing-box".to_string()),
            config_path: "/root/.config/subout/sing-box-running.json".to_string(),
            inbounds_summary: Some("127.0.0.1:2080 (混合代理)".to_string()),
            is_tun: false,
            conflicting_processes: vec![ConflictingProcessInfo {
                pid: 12345,
                name: "sing-box".to_string(),
                cmdline: Some("sing-box run -c /etc/sing-box/config.json".to_string()),
                exe_path: Some("/usr/bin/sing-box".to_string()),
            }],
            log_level: Some("warn".to_string()),
            log_disabled: false,
            log_output: Some("sing-box.log".to_string()),
        };

        let json_val = serde_json::to_value(&status).unwrap();
        assert_eq!(json_val["conflicting_processes"][0]["pid"], 12345);
        assert_eq!(json_val["conflicting_processes"][0]["name"], "sing-box");
        assert_eq!(json_val["inbounds_summary"], "127.0.0.1:2080 (混合代理)");
        assert_eq!(json_val["log_level"], "warn");
        assert_eq!(json_val["log_disabled"], false);
        assert_eq!(json_val["log_output"], "sing-box.log");
    }

    #[test]
    fn test_parse_singbox_log_level() {
        assert_eq!(
            parse_singbox_log_level(
                "+0800 2026-09-02 23:55:23 INFO network: updated default interface"
            ),
            Some(SingboxLogLevel::Info)
        );
        assert_eq!(
            parse_singbox_log_level("2026-09-02 23:55:23 WARN dns: response latency 1500ms"),
            Some(SingboxLogLevel::Warn)
        );
        assert_eq!(
            parse_singbox_log_level("ERROR connection: handshake timeout"),
            Some(SingboxLogLevel::Error)
        );
        assert_eq!(
            parse_singbox_log_level("FATAL[0000] read config at nonexistent.json"),
            Some(SingboxLogLevel::Fatal)
        );
        assert_eq!(
            parse_singbox_log_level("PANIC: runtime memory error"),
            Some(SingboxLogLevel::Panic)
        );
        assert_eq!(
            parse_singbox_log_level("DEBUG inbound/mixed: accept connection"),
            Some(SingboxLogLevel::Debug)
        );
        assert_eq!(
            parse_singbox_log_level("TRACE router: evaluate rule"),
            Some(SingboxLogLevel::Trace)
        );
        assert_eq!(
            parse_singbox_log_level("🟢 sing-box 进程已拉起 (PID: 1234)"),
            None
        );
    }

    #[test]
    fn test_prepare_audit_runtime_config_adds_loopback_clash_api_for_tun() {
        let mut config = serde_json::json!({
            "inbounds": [{"type": "tun", "tag": "tun-in"}],
            "route": {},
            "experimental": {}
        });
        let api = prepare_audit_runtime_config(&mut config, true).expect("TUN API config");
        assert_eq!(config["route"]["find_process"], serde_json::json!(true));
        assert!(api.base_url.starts_with("http://127.0.0.1:"));
        assert!(!api.secret.is_empty());
        assert_eq!(
            config["experimental"]["clash_api"]["external_controller"],
            serde_json::json!(api.base_url.trim_start_matches("http://"))
        );
    }

    #[test]
    fn test_prepare_audit_runtime_config_preserves_explicitly_disabled_clash_api() {
        let mut config = serde_json::json!({
            "inbounds": [{"type": "tun", "tag": "tun-in"}],
            "route": {},
            "experimental": {"clash_api": {}}
        });

        assert!(prepare_audit_runtime_config(&mut config, true).is_none());
        assert_eq!(config["route"]["find_process"], serde_json::json!(true));
        assert_eq!(config["experimental"]["clash_api"], serde_json::json!({}));
    }

    #[test]
    fn test_decorates_final_node_with_subscription_label() {
        let mut resolved = ResolvedOutbound {
            kind: RouteKind::Proxy,
            chain: vec!["代理".to_string(), "hy2台湾09".to_string()],
            final_node: Some("hy2台湾09".to_string()),
        };
        let labels = HashMap::from([("hy2台湾09".to_string(), "飞鸟云".to_string())]);

        decorate_final_node_with_subscription(&mut resolved, &labels);

        assert_eq!(resolved.final_node.as_deref(), Some("飞鸟云/hy2台湾09"));
    }

    #[test]
    fn test_audit_line_deduplicator_only_skips_nearby_duplicate_sources() {
        let mut deduplicator = AuditLineDeduplicator::new();
        assert!(deduplicator.should_ingest("same line"));
        assert!(!deduplicator.should_ingest("same line"));
        deduplicator.recent_lines.insert(
            "same line".to_string(),
            Instant::now() - AUDIT_DUPLICATE_WINDOW,
        );
        assert!(deduplicator.should_ingest("same line"));
    }

    #[tokio::test]
    async fn test_audit_outbound_cache_is_scoped_to_the_current_api_and_ttl() {
        let config = ClashApiConfig {
            base_url: "http://127.0.0.1:9090".to_string(),
            secret: "secret".to_string(),
        };
        let cache = RwLock::new(Some(AuditOutboundCache {
            base_url: config.base_url.clone(),
            fetched_at: Instant::now(),
            response: Arc::new(serde_json::json!({"proxies": {}})),
        }));
        assert!(cached_audit_proxies(&cache, &config).await.is_some());

        cache.write().await.as_mut().unwrap().fetched_at =
            Instant::now() - AUDIT_OUTBOUND_CACHE_TTL;
        assert!(cached_audit_proxies(&cache, &config).await.is_none());

        cache.write().await.as_mut().unwrap().fetched_at = Instant::now();
        let other_config = ClashApiConfig {
            base_url: "http://127.0.0.1:9091".to_string(),
            secret: "secret".to_string(),
        };
        assert!(cached_audit_proxies(&cache, &other_config).await.is_none());
    }

    #[test]
    fn test_should_record_singbox_line() {
        let info_line = "+0800 2026-09-02 23:55:23 INFO inbound/mixed: server started";
        let warn_line = "+0800 2026-09-02 23:55:23 WARN dns: slow query";
        let error_line = "+0800 2026-09-02 23:55:23 ERROR dial tcp: connection refused";

        // When level is warn: info must not be recorded, warn and error must be recorded
        assert!(!should_record_singbox_line(
            info_line,
            SingboxLogLevel::Warn,
            false
        ));
        assert!(should_record_singbox_line(
            warn_line,
            SingboxLogLevel::Warn,
            false
        ));
        assert!(should_record_singbox_line(
            error_line,
            SingboxLogLevel::Warn,
            false
        ));

        // When level is error: info and warn must not be recorded, error must be recorded
        assert!(!should_record_singbox_line(
            info_line,
            SingboxLogLevel::Error,
            false
        ));
        assert!(!should_record_singbox_line(
            warn_line,
            SingboxLogLevel::Error,
            false
        ));
        assert!(should_record_singbox_line(
            error_line,
            SingboxLogLevel::Error,
            false
        ));

        // When level is info: all are recorded
        assert!(should_record_singbox_line(
            info_line,
            SingboxLogLevel::Info,
            false
        ));
        assert!(should_record_singbox_line(
            warn_line,
            SingboxLogLevel::Info,
            false
        ));
        assert!(should_record_singbox_line(
            error_line,
            SingboxLogLevel::Info,
            false
        ));

        // When disabled: none are recorded
        assert!(!should_record_singbox_line(
            info_line,
            SingboxLogLevel::Info,
            true
        ));
        assert!(!should_record_singbox_line(
            warn_line,
            SingboxLogLevel::Info,
            true
        ));
        assert!(!should_record_singbox_line(
            error_line,
            SingboxLogLevel::Info,
            true
        ));
    }

    #[tokio::test]
    async fn test_service_manager_get_status_does_not_deadlock() {
        let mgr = SingBoxServiceManager::new();
        let status = mgr.get_status().await;
        assert!(!status.running);
        assert!(!status.ready);
    }

    #[tokio::test]
    async fn test_new_manager_never_adopts_an_existing_process() {
        // A new panel instance has no Child handle and must not infer ownership
        // from a globally running sing-box process. On Windows an elevated
        // process can hide its command line, so automatic adoption would make
        // stale/orphan cores appear as this instance's healthy service.
        let manager = SingBoxServiceManager::new();
        assert!(!manager.is_running().await);
        let status = manager.get_status().await;
        assert!(!status.running);
        assert!(status.pid.is_none());
    }

    #[tokio::test]
    async fn test_sudo_password_persistence_lifecycle() {
        let unique_id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let db_file = std::env::temp_dir().join(format!("test_sudo_{}.db", unique_id));
        let db_path = db_file.to_string_lossy().to_string();

        let _ = crate::db::init_db(&db_path).unwrap();

        let mgr = SingBoxServiceManager::new();
        mgr.set_db_path(&db_path).await;

        assert!(!mgr.has_saved_sudo_pass().await);

        // Save password
        mgr.save_sudo_pass("my_secret_pass").await;
        assert!(mgr.has_saved_sudo_pass().await);

        // Sudo credentials are intentionally process-lifetime only and must not be persisted.
        let mgr2 = SingBoxServiceManager::new();
        mgr2.set_db_path(&db_path).await;
        mgr2.load_saved_sudo_pass().await;
        assert!(!mgr2.has_saved_sudo_pass().await);

        // Clear password
        mgr2.clear_saved_sudo_pass().await;
        assert!(!mgr2.has_saved_sudo_pass().await);

        // Reload to verify DB was also cleaned
        let mgr3 = SingBoxServiceManager::new();
        mgr3.set_db_path(&db_path).await;
        mgr3.load_saved_sudo_pass().await;
        assert!(!mgr3.has_saved_sudo_pass().await);

        let _ = std::fs::remove_file(&db_file);
    }

    #[test]
    fn only_detected_singbox_processes_are_authorized_for_termination() {
        let conflicts = vec![ConflictingProcessInfo {
            pid: 4242,
            name: "sing-box".to_string(),
            cmdline: Some("sing-box run -c config.json".to_string()),
            exe_path: Some("C:/ProgramData/Subout/bin/sing-box.exe".to_string()),
        }];

        assert!(is_authorized_external_process_pid(&conflicts, 4242));
        assert!(!is_authorized_external_process_pid(&conflicts, 4243));
    }

    #[tokio::test]
    async fn test_audit_retention_setting_defaults_and_persists() {
        let unique_id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let db_file = std::env::temp_dir().join(format!("test_audit_retention_{}.db", unique_id));
        let db_path = db_file.to_string_lossy().to_string();
        crate::db::init_db(&db_path).unwrap();

        let manager = SingBoxServiceManager::new();
        manager.set_db_path(&db_path).await;
        assert_eq!(manager.audit_retention_minutes().await, 20);
        assert_eq!(manager.set_audit_retention_minutes(20).await.unwrap(), 20);

        let manager2 = SingBoxServiceManager::new();
        manager2.set_db_path(&db_path).await;
        assert_eq!(manager2.audit_retention_minutes().await, 20);
        assert_eq!(manager2.set_audit_retention_minutes(999).await.unwrap(), 20);
        assert_eq!(manager2.set_audit_retention_minutes(1).await.unwrap(), 10);

        let _ = std::fs::remove_file(&db_file);
    }

    #[tokio::test]
    async fn test_audit_recording_setting_persists_and_disables_ingestion() {
        let unique_id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let db_file = std::env::temp_dir().join(format!("test_audit_enabled_{}.db", unique_id));
        let db_path = db_file.to_string_lossy().to_string();
        crate::db::init_db(&db_path).unwrap();

        let manager = SingBoxServiceManager::new();
        manager.set_db_path(&db_path).await;
        assert!(manager.audit_recording_enabled().await);
        assert!(!manager.set_audit_recording_enabled(false).await.unwrap());
        manager
            .append_log(
                "INFO[0000] [42 10ms] router: 1.2.3.4:443 tcp using outbound/direct[direct] pid=42",
            )
            .await;
        assert!(manager.get_audit_snapshot().await.is_empty());

        let manager2 = SingBoxServiceManager::new();
        manager2.set_db_path(&db_path).await;
        assert!(!manager2.audit_recording_enabled().await);
        let _ = std::fs::remove_file(&db_file);
    }

    #[tokio::test]
    async fn test_audit_snapshot_and_clear_are_separate_from_raw_logs() {
        let manager = SingBoxServiceManager::new();
        manager.audit.write().await.set_enabled(true);
        manager
            .append_log("INFO[0000] [42 10ms] router: 1.2.3.4:443 tcp using outbound/proxy[proxy] process_name=app.exe pid=42")
            .await;
        assert_eq!(manager.get_logs().await.len(), 1);
        assert_eq!(manager.get_audit_snapshot().await.len(), 1);
        manager.clear_audit().await;
        assert!(manager.get_audit_snapshot().await.is_empty());
        assert_eq!(manager.get_logs().await.len(), 1);
    }

    #[tokio::test]
    async fn test_audit_queue_reports_full_queue_drops_but_not_closed_queue() {
        let (sender, mut receiver) = mpsc::channel(1);
        let generation = AtomicU64::new(0);
        let dropped = AtomicU64::new(0);
        enqueue_audit_line(&sender, &generation, &dropped, "first");
        enqueue_audit_line(&sender, &generation, &dropped, "second");
        assert_eq!(dropped.load(Ordering::Relaxed), 1);
        assert_eq!(
            receiver.recv().await.map(|line| line.line),
            Some("first".to_string())
        );

        drop(receiver);
        enqueue_audit_line(&sender, &generation, &dropped, "after-close");
        assert_eq!(dropped.load(Ordering::Relaxed), 1);
    }

    #[tokio::test]
    async fn test_clear_audit_resets_queue_drop_counter() {
        let manager = SingBoxServiceManager::new();
        manager.audit_queue_dropped.store(3, Ordering::Relaxed);
        manager.clear_audit().await;
        assert_eq!(manager.audit_queue_dropped_lines(), 0);
    }

    #[tokio::test]
    async fn test_clear_audit_discards_lines_queued_before_the_clear() {
        let manager = SingBoxServiceManager::new();
        manager.audit.write().await.set_enabled(true);
        let queued_generation = manager.audit_queue_generation.load(Ordering::Acquire);

        manager.clear_audit().await;
        ingest_audit_line(
            manager.audit.clone(),
            manager.clash_api.clone(),
            manager.node_subscription_labels.clone(),
            manager.audit_outbound_cache.clone(),
            manager.audit_queue_generation.clone(),
            queued_generation,
            "INFO[0000] [42 10ms] router: 1.2.3.4:443 tcp using outbound/proxy[proxy] pid=42",
        )
        .await;

        assert!(manager.get_audit_snapshot().await.is_empty());
    }

    #[tokio::test]
    async fn test_audit_worker_keeps_dns_observations_for_later_connection_enrichment() {
        let audit = Arc::new(RwLock::new(ConnectionAuditStore::new()));
        let generation = Arc::new(AtomicU64::new(0));
        ingest_audit_line(
            audit.clone(),
            Arc::new(RwLock::new(None)),
            Arc::new(RwLock::new(HashMap::new())),
            Arc::new(RwLock::new(None)),
            generation,
            0,
            "INFO[0000] dns: query www.example.com -> 1.2.3.4 pid=123 process_path=C:\\Apps\\demo.exe",
        )
        .await;

        let event = audit
            .write()
            .await
            .ingest_line_at(
                "INFO[0000] [42 3ms] router: 1.2.3.4:443 tcp using outbound/proxy[proxy] process_name=demo.exe process_path=C:\\Apps\\demo.exe pid=123",
                1_100,
                None,
            )
            .expect("connection should be recorded");
        assert_eq!(
            event.target,
            crate::audit::AuditTarget::Domain("www.example.com".into())
        );
        assert_eq!(event.domain_source.as_deref(), Some("dns"));
    }

    #[test]
    fn test_is_pid_alive() {
        let current_pid = std::process::id();
        assert!(is_pid_alive(current_pid));
        assert!(!is_pid_alive(0));
        assert!(!is_pid_alive(1));
        assert!(!is_pid_alive(4_000_000_000));
        assert!(!is_pid_alive(u32::MAX));
    }

    #[tokio::test]
    async fn test_service_status_running_and_ready_logic() {
        let mgr = SingBoxServiceManager::new();
        // Initially stopped
        let st = mgr.get_status().await;
        assert!(!st.running);
        assert!(!st.ready);
        assert!(st.last_error.is_none());

        // Simulate log appending with connection refused error
        mgr.append_log("+0800 2026-08-31 18:15:48 ERROR [2133602452 1.14s] connection: open connection to 192.168.3.80:39459 using outbound/direct[direct]: dial tcp 192.168.3.80:39459: connect: connection refused").await;
        let logs = mgr.get_logs().await;
        assert_eq!(logs.len(), 1);
        assert!(logs[0].contains("connection refused"));

        // Status is still stopped and last_error is None (since runtime log isn't a fatal service crash)
        let st2 = mgr.get_status().await;
        assert!(!st2.running);
        assert!(st2.last_error.is_none());
    }

    #[tokio::test]
    async fn test_file_tailer_captures_logs_and_ready_signal() {
        let unique_id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let log_file = std::env::temp_dir().join(format!("singbox_test_{}.log", unique_id));

        let logs = Arc::new(RwLock::new(VecDeque::with_capacity(MAX_LOG_LINES)));
        let last_error = Arc::new(RwLock::new(None));
        let ready = Arc::new(RwLock::new(false));
        let child_lock: Arc<RwLock<Option<tokio::process::Child>>> = Arc::new(RwLock::new(None));

        let logs_clone = logs.clone();
        let last_error_clone = last_error.clone();
        let ready_clone = ready.clone();
        let is_running_child = child_lock.clone();
        let output_path = log_file.clone();

        let handle = tokio::spawn(async move {
            let mut file = None;
            for _ in 0..50 {
                if let Ok(f) = tokio::fs::File::open(&output_path).await {
                    file = Some(f);
                    break;
                }
                tokio::time::sleep(tokio::time::Duration::from_millis(20)).await;
            }

            if let Some(f) = file {
                let mut reader = BufReader::new(f);
                let mut line_buf = String::new();
                for _ in 0..20 {
                    let still_running = {
                        let mut c = is_running_child.write().await;
                        if let Some(ref mut child) = *c {
                            matches!(child.try_wait(), Ok(None))
                        } else {
                            false
                        }
                    };

                    let mut read_any = false;
                    loop {
                        line_buf.clear();
                        match reader.read_line(&mut line_buf).await {
                            Ok(0) | Err(_) => break,
                            Ok(_) => {
                                read_any = true;
                                let trimmed = line_buf.trim_end_matches(&['\r', '\n'][..]);
                                if !trimmed.is_empty() {
                                    let clean = strip_ansi_codes(trimmed);
                                    let timestamp = chrono::Local::now()
                                        .format("%Y-%m-%d %H:%M:%S")
                                        .to_string();
                                    let formatted = format!("[{}] [sing-box] {}", timestamp, clean);

                                    if is_actual_singbox_error(&clean) {
                                        *last_error_clone.write().await = Some(clean.clone());
                                    } else {
                                        let lower = clean.to_lowercase();
                                        if lower.contains("sing-box started")
                                            || lower.contains("server started at")
                                            || lower.contains("started inbound")
                                            || lower.contains(": started")
                                            || lower.contains("router: started")
                                            || lower.contains("dns: started")
                                        {
                                            *ready_clone.write().await = true;
                                        }
                                    }

                                    let mut l = logs_clone.write().await;
                                    if l.len() >= MAX_LOG_LINES {
                                        l.pop_front();
                                    }
                                    l.push_back(formatted);
                                }
                            }
                        }
                    }

                    if !still_running && !read_any && logs_clone.read().await.len() >= 2 {
                        break;
                    }
                    tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
                }
            }
        });

        // Write sample log lines to file
        tokio::time::sleep(tokio::time::Duration::from_millis(30)).await;
        std::fs::write(
            &log_file,
            "INFO[0000] router: started\nINFO[0001] inbound/mixed: started\n",
        )
        .unwrap();

        let _ = handle.await;

        let captured = logs.read().await;
        assert_eq!(captured.len(), 2);
        assert!(captured[0].contains("router: started"));
        assert!(captured[1].contains("inbound/mixed: started"));
        assert!(*ready.read().await);
    }

    #[tokio::test]
    async fn test_takeover_external_processes_when_none_running() {
        let mgr = SingBoxServiceManager::new();
        let conflicts = mgr.find_external_singbox_processes().await;
        if conflicts.is_empty() {
            // Should succeed immediately without errors when no conflicting external processes exist
            let res = mgr.takeover_external_processes(None).await;
            assert!(res.is_ok());
        } else {
            // In a live environment with root-owned sing-box, unprivileged test won't kill it without sudo pass
            println!(
                "Live external sing-box detected in test environment ({} processes): {:?}",
                conflicts.len(),
                conflicts
            );
        }
    }
}
