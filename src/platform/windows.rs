use anyhow::{Result, anyhow};
use serde_json::{Value, json};
use std::ffi::OsString;
use std::path::{Path, PathBuf};

use crate::platform::{BoxFuture, PlatformStrategy};
use crate::service::ConflictingProcessInfo;

pub struct WindowsPlatform;

pub fn relaunch_current_process_as_administrator(parent_pid: u32) -> Result<()> {
    #[cfg(windows)]
    {
        let executable = std::env::current_exe()
            .map_err(|err| anyhow::anyhow!("无法定位 Subout 可执行文件: {}", err))?;
        let raw_args: Vec<OsString> = std::env::args_os().skip(1).collect();
        let mut args = Vec::with_capacity(raw_args.len() + 2);
        let mut index = 0;
        while index < raw_args.len() {
            if raw_args[index].to_string_lossy() == "--wait-for-parent" {
                // This hidden argument always owns the following PID. Do not
                // pass an old one through when an administrator instance is
                // restarted again.
                index += 2;
            } else {
                args.push(raw_args[index].clone());
                index += 1;
            }
        }

        args.push(OsString::from("--wait-for-parent"));
        args.push(OsString::from(parent_pid.to_string()));

        let quoted_args = args
            .iter()
            .map(|arg| powershell_quote(&arg.to_string_lossy()))
            .collect::<Vec<_>>()
            .join(", ");
        let command = format!(
            "Start-Process -FilePath {} -ArgumentList @({}) -Verb RunAs -ErrorAction Stop",
            powershell_quote(&executable.to_string_lossy()),
            quoted_args
        );
        let output = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &command])
            .output()
            .map_err(|err| anyhow::anyhow!("无法请求 Windows 管理员权限: {}", err))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let message = if stderr.is_empty() {
                "用户取消了管理员权限请求，或 Windows 未能启动管理员实例。".to_string()
            } else {
                format!("管理员权限请求失败: {}", stderr)
            };
            return Err(anyhow::anyhow!(message));
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = parent_pid;
        Err(anyhow::anyhow!("仅 Windows 支持 UAC 重新启动"))
    }
}

fn powershell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

// ------------------------------------------------------------------------------
// System proxy (WinINET) registry plumbing
// ------------------------------------------------------------------------------

const INTERNET_SETTINGS_SUBKEY: &str =
    r"Software\Microsoft\Windows\CurrentVersion\Internet Settings";

const PROXY_OVERRIDE_HOSTS: &str = "<local>;localhost;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;192.168.*";

/// `true` when this process runs as the built-in SYSTEM account (scheduled task / service).
fn running_as_system_account() -> bool {
    let user = std::env::var("USERNAME").unwrap_or_default();
    let domain = std::env::var("USERDOMAIN").unwrap_or_default();

    user.eq_ignore_ascii_case("SYSTEM")
        || (domain.eq_ignore_ascii_case("NT AUTHORITY") && user.eq_ignore_ascii_case("SYSTEM"))
}

/// Registry root (`HKU\<SID>`) of the user currently logged on to the desktop.
///
/// A daemon started by a scheduled task or a service runs as SYSTEM, whose own `HKCU` is
/// `HKU\S-1-5-18`. No browser or WinINET client ever reads that hive, so writing the proxy
/// switch there is a silent no-op for the person using the panel. Resolve the interactive
/// user's SID and address their profile hive instead (SYSTEM may write every loaded hive).
fn interactive_user_hive_root() -> Option<String> {
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        use std::os::windows::process::CommandExt;

        let script = "$u=(Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue).UserName; \
                      if($u){ (New-Object System.Security.Principal.NTAccount($u)).Translate([System.Security.Principal.SecurityIdentifier]).Value }";

        let output = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok()?;

        if !output.status.success() {
            return None;
        }

        let sid = String::from_utf8_lossy(&output.stdout).trim().to_string();

        if sid.starts_with("S-1-") && sid != "S-1-5-18" {
            return Some(format!(r"HKU\{}", sid));
        }

        None
    }
    #[cfg(not(windows))]
    {
        None
    }
}

/// `HKU\<SID>` of the desktop user, or `HKCU` when this process *is* that user.
fn proxy_hive_root() -> Option<String> {
    if let Some(root) = interactive_user_hive_root() {
        return Some(root);
    }

    if running_as_system_account() {
        // Never fall back to the SYSTEM hive here: it would report success while changing
        // a setting no application reads.
        return None;
    }

    // Elevated run inside the user's own session: HKCU already is that user's hive.
    Some("HKCU".to_string())
}

fn proxy_settings_key(root: &str) -> String {
    format!(r"{}\{}", root, INTERNET_SETTINGS_SUBKEY)
}

/// Where the pre-Subout proxy settings are remembered for restoration.
fn proxy_backup_key(root: &str) -> String {
    format!(r"{}\Software\Subout\ProxyBackup", root)
}

fn reg_add(key_path: &str, name: &str, kind: &str, value: &str) -> bool {
    std::process::Command::new("reg")
        .args(["add", key_path, "/v", name, "/t", kind, "/d", value, "/f"])
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn reg_delete(key_path: &str, name: &str) -> bool {
    std::process::Command::new("reg")
        .args(["delete", key_path, "/v", name, "/f"])
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn reg_delete_key(key_path: &str) -> bool {
    std::process::Command::new("reg")
        .args(["delete", key_path, "/f"])
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn reg_query_dword(key_path: &str, name: &str) -> Option<u32> {
    let output = std::process::Command::new("reg")
        .args(["query", key_path, "/v", name])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    parse_reg_dword(&String::from_utf8_lossy(&output.stdout), name)
}

fn reg_query_string(key_path: &str, name: &str) -> Option<String> {
    let output = std::process::Command::new("reg")
        .args(["query", key_path, "/v", name])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    parse_reg_string(&String::from_utf8_lossy(&output.stdout), name)
}

/// Parses `    ProxyEnable    REG_DWORD    0x1` out of `reg query` output.
fn parse_reg_dword(stdout: &str, name: &str) -> Option<u32> {
    for line in stdout.lines() {
        let mut parts = line.split_whitespace();

        if parts.next() != Some(name) {
            continue;
        }

        let _kind = parts.next()?;
        let raw = parts.next()?.trim();
        let hex = raw
            .strip_prefix("0x")
            .or_else(|| raw.strip_prefix("0X"))
            .unwrap_or(raw);

        return u32::from_str_radix(hex, 16).ok();
    }

    None
}

/// Parses `    ProxyServer    REG_SZ    127.0.0.1:1234` out of `reg query` output.
///
/// The value may contain spaces (`ProxyOverride` typically does), so only the name and the
/// type are tokenised and the remainder is kept verbatim.
fn parse_reg_string(stdout: &str, name: &str) -> Option<String> {
    for line in stdout.lines() {
        let trimmed = line.trim_start();
        let Some(rest) = trimmed.strip_prefix(name) else {
            continue;
        };

        if !rest.starts_with([' ', '\t']) {
            continue;
        }

        let mut split = rest.trim_start().splitn(2, char::is_whitespace);
        let _kind = split.next()?;

        return Some(
            split
                .next()
                .unwrap_or_default()
                .trim_start()
                .trim_end()
                .to_string(),
        );
    }

    None
}

/// Snapshot the user's own proxy settings, exactly once, before Subout overwrites them.
///
/// Without it the original server/override are unrecoverable: `disable_system_proxy` could
/// only switch our entry off, leaving the user with no proxy at all. Snapshotting is
/// skipped when one already exists — after a crash the settings already contain Subout's
/// own `127.0.0.1:<port>`, and backing *that* up would destroy the real originals.
fn save_proxy_backup(root: &str, settings_key: &str) -> Result<()> {
    let backup_key = proxy_backup_key(root);

    if reg_query_dword(&backup_key, "Saved") == Some(1) {
        return Ok(());
    }

    if let Some(value) = reg_query_dword(settings_key, "ProxyEnable")
        && !reg_add(&backup_key, "ProxyEnable", "REG_DWORD", &value.to_string())
    {
        return Err(anyhow!("保存原始 ProxyEnable 失败: {}", backup_key));
    }

    if let Some(value) = reg_query_string(settings_key, "ProxyServer")
        && !reg_add(&backup_key, "ProxyServer", "REG_SZ", &value)
    {
        return Err(anyhow!("保存原始 ProxyServer 失败: {}", backup_key));
    }

    if let Some(value) = reg_query_string(settings_key, "ProxyOverride")
        && !reg_add(&backup_key, "ProxyOverride", "REG_SZ", &value)
    {
        return Err(anyhow!("保存原始 ProxyOverride 失败: {}", backup_key));
    }

    if !reg_add(&backup_key, "Saved", "REG_DWORD", "1") {
        return Err(anyhow!("标记代理备份失败: {}", backup_key));
    }

    Ok(())
}

/// Restore the snapshot written by `save_proxy_backup`.
///
/// Returns whether a snapshot existed. Values that were absent before are deleted again so
/// the user's configuration is left exactly as it was found.
fn restore_proxy_backup(root: &str, settings_key: &str) -> Result<bool> {
    let backup_key = proxy_backup_key(root);

    if reg_query_dword(&backup_key, "Saved") != Some(1) {
        return Ok(false);
    }

    match reg_query_dword(&backup_key, "ProxyEnable") {
        Some(value) => {
            let written = reg_add(settings_key, "ProxyEnable", "REG_DWORD", &value.to_string())
                && reg_query_dword(settings_key, "ProxyEnable") == Some(value);

            if !written {
                return Err(anyhow!("恢复原始 ProxyEnable 失败"));
            }
        }
        None => {
            reg_delete(settings_key, "ProxyEnable");

            if reg_query_dword(settings_key, "ProxyEnable").is_some() {
                return Err(anyhow!("清除 ProxyEnable 失败"));
            }
        }
    }

    match reg_query_string(&backup_key, "ProxyServer") {
        Some(value) => {
            let written = reg_add(settings_key, "ProxyServer", "REG_SZ", &value)
                && reg_query_string(settings_key, "ProxyServer").as_deref() == Some(value.as_str());

            if !written {
                return Err(anyhow!("恢复原始 ProxyServer 失败"));
            }
        }
        None => {
            reg_delete(settings_key, "ProxyServer");
        }
    }

    match reg_query_string(&backup_key, "ProxyOverride") {
        Some(value) => {
            let written = reg_add(settings_key, "ProxyOverride", "REG_SZ", &value)
                && reg_query_string(settings_key, "ProxyOverride").as_deref()
                    == Some(value.as_str());

            if !written {
                return Err(anyhow!("恢复原始 ProxyOverride 失败"));
            }
        }
        None => {
            reg_delete(settings_key, "ProxyOverride");
        }
    }

    // Consumed: the next enable takes a fresh snapshot.
    reg_delete_key(&backup_key);

    Ok(true)
}

impl PlatformStrategy for WindowsPlatform {
    fn os_name(&self) -> &'static str {
        "windows"
    }

    fn is_running_as_root(&self) -> bool {
        #[cfg(windows)]
        {
            unsafe extern "system" {
                fn IsUserAnAdmin() -> i32;
            }
            unsafe { IsUserAnAdmin() != 0 }
        }
        #[cfg(not(windows))]
        {
            false
        }
    }

    fn run_sudo_command<'a>(
        &'a self,
        _cmd_name: &'a str,
        _args: &'a [&'a str],
        _sudo_pass: Option<&'a str>,
    ) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move { Ok(()) })
    }

    fn setup_child_process(&self, _cmd: &mut tokio::process::Command) {
        #[cfg(windows)]
        {
            _cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
    }

    fn tun_permission_error_guide(&self, err: &str, _singbox_bin: &Path) -> String {
        if err.contains("Cannot create a file when that file already exists")
            || err.contains("open existing adapter")
        {
            "TUN 虚拟网卡设备冲突：检测到系统中存在残留的 Wintun 虚拟网卡（通常是上次异常关闭或其它代理软件残留）。已自动执行清理，请点击重新启动。若仍报错，请在设备管理器中卸载残存的 Wintun 网卡或重启电脑。".to_string()
        } else {
            format!(
                "TUN 模式启动失败 ({}): 创建 Wintun 虚拟网卡需要 Windows 系统管理员权限。请以管理员身份运行 Subout 后重试。",
                err
            )
        }
    }

    fn is_pid_alive(&self, pid: u32) -> bool {
        if pid == 0 {
            return false;
        }

        #[cfg(windows)]
        {
            type Handle = *mut std::ffi::c_void;
            type Bool = i32;
            type Dword = u32;

            const PROCESS_QUERY_LIMITED_INFORMATION: Dword = 0x1000;
            const SYNCHRONIZE: Dword = 0x00100000;
            const WAIT_TIMEOUT: Dword = 0x00000102;
            const STILL_ACTIVE: Dword = 259;
            const ERROR_ACCESS_DENIED: Dword = 5;

            unsafe extern "system" {
                fn OpenProcess(
                    dwDesiredAccess: Dword,
                    bInheritHandle: Bool,
                    dwProcessId: Dword,
                ) -> Handle;
                fn WaitForSingleObject(hHandle: Handle, dwMilliseconds: Dword) -> Dword;
                fn GetExitCodeProcess(hProcess: Handle, lpExitCode: *mut Dword) -> Bool;
                fn CloseHandle(hObject: Handle) -> Bool;
            }

            let handle =
                unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, 0, pid) };
            if !handle.is_null() {
                let wait_res = unsafe { WaitForSingleObject(handle, 0) };
                let mut exit_code: Dword = 0;
                let get_code_res = unsafe { GetExitCodeProcess(handle, &mut exit_code) };
                unsafe { CloseHandle(handle) };

                wait_res == WAIT_TIMEOUT || (get_code_res != 0 && exit_code == STILL_ACTIVE)
            } else {
                let err = std::io::Error::last_os_error().raw_os_error().unwrap_or(0) as Dword;
                err == ERROR_ACCESS_DENIED
            }
        }
        #[cfg(not(windows))]
        {
            let _ = pid;
            false
        }
    }

    fn detect_conflicting_processes(
        &self,
        managed_pid: Option<u32>,
        running_config_path: &Path,
    ) -> Vec<ConflictingProcessInfo> {
        let current_pid = std::process::id();
        let mut results: Vec<ConflictingProcessInfo> = Vec::new();
        let mut seen_pids: std::collections::HashSet<u32> = std::collections::HashSet::new();
        let mut cim_query_succeeded = false;

        // 1. Primary: Use PowerShell + CIM with JSON serialization to safely inspect sing-box processes
        if let Ok(output) = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Get-CimInstance Win32_Process -Filter \"Name = 'sing-box.exe' or Name = 'singbox.exe' or Name = 'sing-box'\" | Select-Object ProcessId, ParentProcessId, Name, CommandLine, ExecutablePath | ConvertTo-Json -Compress",
            ])
            .output()
            && output.status.success()
        {
            cim_query_succeeded = true;
            let stdout = String::from_utf8_lossy(&output.stdout);
            let items = parse_cim_process_json(&stdout);
            let filtered = filter_conflicting_processes(items, current_pid, managed_pid, running_config_path);
            for proc in filtered {
                if seen_pids.insert(proc.pid) {
                    results.push(proc);
                }
            }
        }

        // 2. Secondary fallback: tasklist only when the CIM query itself failed.
        // A successful CIM query that yields no external process is authoritative; falling
        // back here loses command-line/parent information and can report Subout's own child.
        if should_fallback_to_tasklist(cim_query_succeeded) {
            for img_name in &["sing-box.exe", "singbox.exe"] {
                if let Ok(output) = std::process::Command::new("tasklist")
                    .args([
                        "/FI",
                        &format!("IMAGENAME eq {}", img_name),
                        "/FO",
                        "CSV",
                        "/NH",
                    ])
                    .output()
                    && output.status.success()
                {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    for line in stdout.lines() {
                        let fields: Vec<String> = line
                            .split(',')
                            .map(|s| s.trim_matches('"').trim().to_string())
                            .collect();
                        if fields.len() >= 2
                            && let Ok(pid) = fields[1].parse::<u32>()
                        {
                            if pid == current_pid || Some(pid) == managed_pid || pid <= 4 {
                                continue;
                            }
                            if seen_pids.insert(pid) {
                                results.push(ConflictingProcessInfo {
                                    pid,
                                    name: fields[0].clone(),
                                    cmdline: None,
                                    exe_path: None,
                                });
                            }
                        }
                    }
                }
            }
        }

        results
    }

    fn kill_process<'a>(
        &'a self,
        pid: u32,
        _sudo_pass: Option<&'a str>,
        _sig: i32,
    ) -> BoxFuture<'a, ()> {
        Box::pin(async move {
            // First attempt graceful termination without /F so sing-box can close Wintun adapter cleanly
            let _ = tokio::process::Command::new("taskkill")
                .args(["/PID", &pid.to_string()])
                .output()
                .await;

            // Wait briefly for process to exit
            for _ in 0..6 {
                tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
                if !self.is_pid_alive(pid) {
                    return;
                }
            }

            // Force kill if process hasn't exited
            let _ = tokio::process::Command::new("taskkill")
                .args(["/F", "/T", "/PID", &pid.to_string()])
                .output()
                .await;
        })
    }

    fn kill_all_subout_processes<'a>(
        &'a self,
        _sudo_pass: Option<&'a str>,
        exclude_pid: Option<u32>,
        running_config_path: &'a Path,
    ) -> BoxFuture<'a, ()> {
        Box::pin(async move {
            let current_pid = std::process::id();
            let config_path_str = running_config_path.to_string_lossy().to_string();
            let config_path_norm = config_path_str.replace('/', "\\");
            let mut pids_to_kill: Vec<u32> = Vec::new();

            if let Ok(output) = std::process::Command::new("powershell")
                .args([
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    "Get-CimInstance Win32_Process -Filter \"Name = 'sing-box.exe' or Name = 'singbox.exe' or Name = 'sing-box'\" | Select-Object ProcessId, ParentProcessId, Name, CommandLine | ConvertTo-Json -Compress",
                ])
                .output()
                && output.status.success() {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    let items = parse_cim_process_json(&stdout);

                    for item in items {
                        let pid = item.process_id.unwrap_or(0);
                        let ppid = item.parent_process_id.unwrap_or(0);
                        if pid == 0 || pid <= 4 || pid == current_pid || Some(pid) == exclude_pid {
                            continue;
                        }
                        let name = item.name.unwrap_or_default().to_lowercase();
                        if name.contains("powershell") || name.contains("pwsh") || name.contains("cmd") || name.contains("cargo") {
                            continue;
                        }
                        let cmdline = item.command_line.unwrap_or_default();
                        let cmdline_lower = cmdline.to_lowercase();
                        let is_subout_instance = cmdline.contains(&config_path_str)
                            || cmdline.contains(&config_path_norm)
                            || cmdline_lower.contains("sing-box.json")
                            || cmdline_lower.contains("sing-box-running.json")
                            || cmdline_lower.contains("subout")
                            || ppid == current_pid
                            || (exclude_pid.is_some() && Some(ppid) == exclude_pid);

                        if is_subout_instance {
                            pids_to_kill.push(pid);
                        }
                    }
                }

            for pid in pids_to_kill {
                let _ = std::process::Command::new("taskkill")
                    .args(["/F", "/T", "/PID", &pid.to_string()])
                    .output();
            }
        })
    }

    fn stop_external_service_or_process<'a>(
        &'a self,
        pid: u32,
        _sudo_pass: Option<&'a str>,
    ) -> BoxFuture<'a, Result<()>> {
        Box::pin(async move {
            let pid_str = pid.to_string();
            let _ = tokio::process::Command::new("powershell")
                .args([
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    "Stop-Service sing-box -ErrorAction SilentlyContinue; Stop-Service singbox -ErrorAction SilentlyContinue; Set-Service sing-box -StartupType Disabled -ErrorAction SilentlyContinue; Set-Service singbox -StartupType Disabled -ErrorAction SilentlyContinue",
                ])
                .output()
                .await;
            let _ = tokio::process::Command::new("taskkill")
                .args(["/F", "/T", "/PID", &pid_str])
                .output()
                .await;
            Ok(())
        })
    }

    fn external_process_stop_failed_message(&self, pid: u32, _has_sudo_pass: bool) -> String {
        format!(
            "终止/接管外部进程 (PID: {}) 失败：进程仍在运行。请以管理员身份运行 Subout，或在 PowerShell (管理员) 中执行 Stop-Service sing-box; Set-Service sing-box -StartupType Disabled / taskkill /F /PID {} 终止该进程",
            pid, pid
        )
    }

    fn enable_system_proxy(&self, port: u16, _sudo_pass: Option<&str>) -> Result<()> {
        let root = proxy_hive_root().ok_or_else(|| {
            anyhow::anyhow!(
                "未能确定交互式登录用户的注册表配置单元：系统代理只能写入已登录桌面的用户。\
                 请先登录桌面后再开启系统代理，或改用 TUN 模式。"
            )
        })?;

        let settings_key = proxy_settings_key(&root);

        // Remember the user's own proxy settings before the first overwrite.
        save_proxy_backup(&root, &settings_key)?;

        let proxy_addr = format!("127.0.0.1:{}", port);

        if !reg_add(&settings_key, "ProxyEnable", "REG_DWORD", "1") {
            anyhow::bail!("写入 ProxyEnable 失败: {}", settings_key);
        }

        if !reg_add(&settings_key, "ProxyServer", "REG_SZ", &proxy_addr) {
            anyhow::bail!("写入 ProxyServer 失败: {}", settings_key);
        }

        if !reg_add(&settings_key, "ProxyOverride", "REG_SZ", PROXY_OVERRIDE_HOSTS) {
            anyhow::bail!("写入 ProxyOverride 失败: {}", settings_key);
        }

        // Refreshes WinINET in this process; clients in the user's session pick the new
        // value up when they next read the settings (usually after a restart).
        refresh_wininet_proxy();

        // `reg add` can succeed while the hive keeps the old value, so verify the switch
        // before reporting success to the panel.
        if reg_query_dword(&settings_key, "ProxyEnable") != Some(1) {
            anyhow::bail!("系统代理写入后回读校验未通过: {}", settings_key);
        }

        Ok(())
    }

    fn disable_system_proxy(&self, _sudo_pass: Option<&str>) -> Result<()> {
        // Nothing was ever set if the desktop user cannot be resolved.
        let Some(root) = proxy_hive_root() else {
            return Ok(());
        };

        let settings_key = proxy_settings_key(&root);

        // Preferred path: put the user's own proxy configuration back verbatim.
        if restore_proxy_backup(&root, &settings_key)? {
            refresh_wininet_proxy();
            return Ok(());
        }

        // No snapshot (e.g. enabled by an older build): at least switch ours off.
        if !reg_add(&settings_key, "ProxyEnable", "REG_DWORD", "0") {
            anyhow::bail!("关闭系统代理失败: {}", settings_key);
        }

        refresh_wininet_proxy();

        if reg_query_dword(&settings_key, "ProxyEnable") == Some(1) {
            anyhow::bail!("系统代理关闭后回读校验未通过: {}", settings_key);
        }

        Ok(())
    }

    fn restore_stale_system_proxy(&self, _sudo_pass: Option<&str>) -> Result<()> {
        // A leftover snapshot means the previous run was killed before it could restore the
        // user's proxy; that proxy now points at a port nobody listens on.
        let Some(root) = proxy_hive_root() else {
            return Ok(());
        };

        let settings_key = proxy_settings_key(&root);

        if restore_proxy_backup(&root, &settings_key)? {
            refresh_wininet_proxy();
        }

        Ok(())
    }

    fn enable_tun_dns(&self, _dns_ip: &str, _sudo_pass: Option<&str>) {}

    fn disable_tun_dns(&self, _sudo_pass: Option<&str>) {}

    fn sanitize_inbound(&self, inbound: &mut Value) {
        if let Some(obj) = inbound.as_object_mut() {
            let is_tun = obj.get("type").and_then(|t| t.as_str()) == Some("tun");
            obj.remove("auto_redirect");
            if is_tun {
                if let Some(iface) = obj.get("interface_name").and_then(|i| i.as_str()) {
                    if iface == "tun0" || iface.is_empty() {
                        obj.insert("interface_name".to_string(), json!("subout-tun"));
                    }
                } else {
                    obj.insert("interface_name".to_string(), json!("subout-tun"));
                }

                // If stack is system on Windows, switch to mixed (wintun standard)
                if let Some(stack) = obj.get("stack").and_then(|s| s.as_str()) {
                    if stack == "system" {
                        obj.insert("stack".to_string(), json!("mixed"));
                    }
                } else {
                    obj.insert("stack".to_string(), json!("mixed"));
                }

                // Windows strict_route MUST be true
                obj.insert("strict_route".to_string(), json!(true));
            }
        }
    }

    fn default_tun_interface_name(&self) -> &'static str {
        "subout-tun"
    }

    fn default_tun_strict_route(&self) -> bool {
        true
    }

    fn effective_tun_stack<'a>(&self, configured_stack: &'a str) -> &'a str {
        if configured_stack == "system" {
            "mixed"
        } else {
            configured_stack
        }
    }

    fn default_data_dir(&self) -> PathBuf {
        std::env::var("ProgramData")
            .or_else(|_| std::env::var("ALLUSERSPROFILE"))
            .map(|p| PathBuf::from(p).join("Subout"))
            .unwrap_or_else(|_| PathBuf::from(r"C:\ProgramData\Subout"))
    }

    fn default_config_dir(&self, data_dir: &Path) -> PathBuf {
        data_dir.join("config")
    }

    fn default_log_dir(&self, data_dir: &Path) -> PathBuf {
        data_dir.join("logs")
    }

    fn default_runtime_dir(&self, data_dir: &Path) -> PathBuf {
        data_dir.join("run")
    }

    fn kernel_binary_name(&self) -> &'static str {
        "sing-box.exe"
    }

    fn standard_singbox_candidates(&self, binary_name: &str) -> Vec<PathBuf> {
        let mut candidates = vec![
            PathBuf::from(format!(r"C:\Program Files\Subout\{}", binary_name)),
            PathBuf::from(format!(r"C:\Program Files\sing-box\{}", binary_name)),
            PathBuf::from(format!(r"C:\ProgramData\Subout\bin\{}", binary_name)),
            PathBuf::from(format!(r"C:\ProgramData\subout\bin\{}", binary_name)),
        ];

        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            candidates.push(
                PathBuf::from(local_app_data)
                    .join("Programs")
                    .join("sing-box")
                    .join(binary_name),
            );
        }
        if let Ok(user_profile) = std::env::var("USERPROFILE") {
            candidates.push(
                PathBuf::from(user_profile)
                    .join("scoop")
                    .join("apps")
                    .join("sing-box")
                    .join("current")
                    .join(binary_name),
            );
        }
        if let Ok(program_data) = std::env::var("ProgramData") {
            candidates.push(
                PathBuf::from(program_data)
                    .join("chocolatey")
                    .join("bin")
                    .join(binary_name),
            );
        }

        candidates
    }

    fn legacy_db_candidates(&self, _config_dir: &Path) -> Vec<PathBuf> {
        vec![PathBuf::from(r"C:\ProgramData\subout\subout.db")]
    }

    fn find_in_path(&self, cmd_name: &str) -> Option<PathBuf> {
        if let Ok(output) = std::process::Command::new("where").arg(cmd_name).output()
            && output.status.success()
        {
            let out_str = String::from_utf8_lossy(&output.stdout);
            for line in out_str.lines() {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    let p = PathBuf::from(trimmed);
                    if p.exists() {
                        return Some(p);
                    }
                }
            }
        }
        None
    }
}

#[derive(serde::Deserialize, Debug, Clone, PartialEq)]
pub struct CimProcessItem {
    #[serde(rename = "ProcessId")]
    pub process_id: Option<u32>,
    #[serde(rename = "ParentProcessId")]
    pub parent_process_id: Option<u32>,
    #[serde(rename = "Name")]
    pub name: Option<String>,
    #[serde(rename = "CommandLine")]
    pub command_line: Option<String>,
    #[serde(rename = "ExecutablePath")]
    pub executable_path: Option<String>,
}

pub fn parse_cim_process_json(stdout: &str) -> Vec<CimProcessItem> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    if let Ok(list) = serde_json::from_str::<Vec<CimProcessItem>>(trimmed) {
        list
    } else if let Ok(single) = serde_json::from_str::<CimProcessItem>(trimmed) {
        vec![single]
    } else {
        Vec::new()
    }
}

fn should_fallback_to_tasklist(cim_query_succeeded: bool) -> bool {
    !cim_query_succeeded
}

pub fn filter_conflicting_processes(
    items: Vec<CimProcessItem>,
    current_pid: u32,
    managed_pid: Option<u32>,
    running_config_path: &Path,
) -> Vec<ConflictingProcessInfo> {
    let config_path_str = running_config_path.to_string_lossy().to_string();
    let config_path_norm = config_path_str.replace('/', "\\");
    let mut results = Vec::new();
    let mut seen_pids = std::collections::HashSet::new();

    for item in items {
        let pid = item.process_id.unwrap_or(0);
        if pid == 0 || pid <= 4 || pid == current_pid || Some(pid) == managed_pid {
            continue;
        }

        if let Some(ppid) = item.parent_process_id
            && (ppid == current_pid || (managed_pid.is_some() && Some(ppid) == managed_pid))
        {
            continue;
        }

        let name = item.name.unwrap_or_default();
        let name_lower = name.to_lowercase();
        // Exclude Subout itself, parent build runners (cargo/rustc), and shells/system wrappers
        if name_lower.contains("subout")
            || name_lower.contains("powershell")
            || name_lower.contains("pwsh")
            || name_lower.contains("cmd")
            || name_lower.contains("cargo")
            || name_lower.contains("rustc")
            || name_lower.contains("conhost")
        {
            continue;
        }

        let cmdline = item.command_line.clone();
        let exe_path = item.executable_path.clone();

        let is_subout_instance = cmdline
            .as_deref()
            .map(|c| {
                let c_lower = c.to_lowercase();
                c_lower.contains("subout")
                    || c.contains(&config_path_str)
                    || c.contains(&config_path_norm)
                    || c_lower.contains("sing-box.json")
                    || c_lower.contains("sing-box-running.json")
            })
            .unwrap_or(false);

        if is_subout_instance {
            continue;
        }

        if seen_pids.insert(pid) {
            results.push(ConflictingProcessInfo {
                pid,
                name,
                cmdline,
                exe_path,
            });
        }
    }

    results
}

pub fn refresh_wininet_proxy() {
    #[cfg(windows)]
    {
        unsafe extern "system" {
            fn InternetSetOptionW(
                h_internet: *mut std::ffi::c_void,
                dw_option: u32,
                lp_buffer: *mut std::ffi::c_void,
                dw_buffer_length: u32,
            ) -> i32;
        }
        const INTERNET_OPTION_SETTINGS_CHANGED: u32 = 39;
        const INTERNET_OPTION_REFRESH: u32 = 37;
        unsafe {
            InternetSetOptionW(
                std::ptr::null_mut(),
                INTERNET_OPTION_SETTINGS_CHANGED,
                std::ptr::null_mut(),
                0,
            );
            InternetSetOptionW(
                std::ptr::null_mut(),
                INTERNET_OPTION_REFRESH,
                std::ptr::null_mut(),
                0,
            );
        }
    }
    #[cfg(not(windows))]
    {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_proxy_enable_dword_from_reg_query_output() {
        let output = "\r\nHKEY_USERS\\S-1-5-21-1-2-3-1001\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\r\n    ProxyEnable    REG_DWORD    0x1\r\n\r\n";

        assert_eq!(parse_reg_dword(output, "ProxyEnable"), Some(1));
        assert_eq!(parse_reg_dword(output, "ProxyServer"), None);
    }

    #[test]
    fn parses_disabled_and_missing_proxy_switch() {
        let disabled = "    ProxyEnable    REG_DWORD    0x0\r\n";
        assert_eq!(parse_reg_dword(disabled, "ProxyEnable"), Some(0));

        // A hive that silently kept the old value (or was never written) has no such line.
        assert_eq!(parse_reg_dword("", "ProxyEnable"), None);
        assert_eq!(parse_reg_dword("noise\r\n", "ProxyEnable"), None);
    }

    /// Snapshot of the current user's WinINET settings plus Subout's backup key, restored on
    /// drop so a panicking assertion still leaves the machine's network settings untouched.
    struct ProxySnapshot {
        settings_key: String,
        backup_key: String,
        enable: Option<u32>,
        server: Option<String>,
        override_hosts: Option<String>,
    }

    impl ProxySnapshot {
        fn capture(root: &str) -> Self {
            let settings_key = proxy_settings_key(root);

            Self {
                enable: reg_query_dword(&settings_key, "ProxyEnable"),
                server: reg_query_string(&settings_key, "ProxyServer"),
                override_hosts: reg_query_string(&settings_key, "ProxyOverride"),
                backup_key: proxy_backup_key(root),
                settings_key,
            }
        }
    }

    impl Drop for ProxySnapshot {
        fn drop(&mut self) {
            for (name, value) in [
                ("ProxyServer", self.server.as_deref()),
                ("ProxyOverride", self.override_hosts.as_deref()),
            ] {
                match value {
                    Some(value) => {
                        reg_add(&self.settings_key, name, "REG_SZ", value);
                    }
                    None => {
                        reg_delete(&self.settings_key, name);
                    }
                }
            }

            match self.enable {
                Some(value) => {
                    reg_add(
                        &self.settings_key,
                        "ProxyEnable",
                        "REG_DWORD",
                        &value.to_string(),
                    );
                }
                None => {
                    reg_delete(&self.settings_key, "ProxyEnable");
                }
            }

            // Never leave the test's snapshot behind.
            for name in ["Saved", "ProxyEnable", "ProxyServer", "ProxyOverride"] {
                reg_delete(&self.backup_key, name);
            }
        }
    }

    /// Opt-in integration check: exercises the real proxy switch, the snapshot it takes and
    /// the crash-recovery path. Run with `cargo test -- --ignored proxy_switch_round_trip`.
    #[test]
    #[ignore = "改写当前用户的 WinINET 代理设置，仅在需要人工验证时运行"]
    fn proxy_switch_round_trip_targets_the_desktop_hive() {
        if !cfg!(windows) || running_as_system_account() {
            // Under SYSTEM the whole point of the fix is that HKCU is NOT the desktop hive.
            return;
        }

        let root = proxy_hive_root().expect("interactive user hive must resolve");
        assert!(
            root.starts_with("HKU\\") || root == "HKCU",
            "unexpected hive root: {root}"
        );

        let settings_key = proxy_settings_key(&root);
        let backup_key = proxy_backup_key(&root);

        let _snapshot = ProxySnapshot::capture(&root);

        // Pretend the user already runs their own proxy on 10808.
        reg_add(&settings_key, "ProxyEnable", "REG_DWORD", "0");
        reg_add(&settings_key, "ProxyServer", "REG_SZ", "127.0.0.1:10808");
        reg_delete(&backup_key, "Saved");

        // Enable: Subout takes the proxy over and remembers the original server.
        WindowsPlatform
            .enable_system_proxy(50443, None)
            .expect("enable_system_proxy should succeed for the interactive user");
        assert_eq!(reg_query_dword(&settings_key, "ProxyEnable"), Some(1));
        assert_eq!(
            reg_query_string(&settings_key, "ProxyServer").as_deref(),
            Some("127.0.0.1:50443")
        );
        assert_eq!(
            reg_query_dword(&backup_key, "Saved"),
            Some(1),
            "the user's settings must be backed up"
        );
        assert_eq!(
            reg_query_string(&backup_key, "ProxyServer").as_deref(),
            Some("127.0.0.1:10808")
        );

        // A second enable must not overwrite the snapshot with Subout's own value.
        WindowsPlatform
            .enable_system_proxy(50443, None)
            .expect("second enable should succeed");
        assert_eq!(
            reg_query_string(&backup_key, "ProxyServer").as_deref(),
            Some("127.0.0.1:10808"),
            "the snapshot must keep the real original"
        );

        // Disable: the user's own proxy configuration comes back verbatim.
        WindowsPlatform
            .disable_system_proxy(None)
            .expect("disable_system_proxy should succeed");
        assert_eq!(
            reg_query_string(&settings_key, "ProxyServer").as_deref(),
            Some("127.0.0.1:10808"),
            "the original proxy server must be restored"
        );
        assert_eq!(reg_query_dword(&settings_key, "ProxyEnable"), Some(0));
        assert_eq!(
            reg_query_dword(&backup_key, "Saved"),
            None,
            "the snapshot must be consumed"
        );

        // Crash recovery: enable, "crash" (no disable), then let startup roll it back.
        WindowsPlatform
            .enable_system_proxy(50444, None)
            .expect("enable before simulated crash");
        assert_eq!(
            reg_query_string(&settings_key, "ProxyServer").as_deref(),
            Some("127.0.0.1:50444")
        );

        WindowsPlatform
            .restore_stale_system_proxy(None)
            .expect("stale proxy repair should succeed");
        assert_eq!(
            reg_query_string(&settings_key, "ProxyServer").as_deref(),
            Some("127.0.0.1:10808"),
            "a leftover snapshot must be rolled back on startup"
        );
        assert_eq!(reg_query_dword(&settings_key, "ProxyEnable"), Some(0));
    }

    #[test]
    fn parses_proxy_server_string_from_reg_query_output() {
        let output = "HKEY_USERS\\S-1-5-21-1-2-3-1001\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\r\n    ProxyServer    REG_SZ    127.0.0.1:10808\r\n\r\n";
        assert_eq!(
            parse_reg_string(output, "ProxyServer").as_deref(),
            Some("127.0.0.1:10808")
        );

        // An empty REG_SZ reads back as an empty string, not as "absent".
        let empty = "    ProxyServer    REG_SZ    \r\n";
        assert_eq!(parse_reg_string(empty, "ProxyServer").as_deref(), Some(""));

        // Values with spaces (proxy overrides commonly have them) are preserved.
        let spaced = "    ProxyOverride    REG_SZ    <local>;10.*;172.16.*\r\n";
        assert_eq!(
            parse_reg_string(spaced, "ProxyOverride").as_deref(),
            Some("<local>;10.*;172.16.*")
        );

        assert_eq!(parse_reg_string("", "ProxyServer"), None);
    }

    #[test]
    fn test_parse_cim_process_json_empty_and_invalid() {
        assert!(parse_cim_process_json("").is_empty());
        assert!(parse_cim_process_json("   \n\t  ").is_empty());
        assert!(parse_cim_process_json("invalid json").is_empty());
    }

    #[test]
    fn test_parse_cim_process_json_single_object() {
        let single_json = r#"{
            "ProcessId": 2096,
            "ParentProcessId": 1000,
            "Name": "sing-box.exe",
            "CommandLine": "sing-box.exe run -c C:\\conf.json",
            "ExecutablePath": "C:\\Program Files\\sing-box\\sing-box.exe"
        }"#;

        let parsed = parse_cim_process_json(single_json);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].process_id, Some(2096));
        assert_eq!(parsed[0].parent_process_id, Some(1000));
        assert_eq!(parsed[0].name.as_deref(), Some("sing-box.exe"));
        assert_eq!(
            parsed[0].command_line.as_deref(),
            Some("sing-box.exe run -c C:\\conf.json")
        );
        assert_eq!(
            parsed[0].executable_path.as_deref(),
            Some("C:\\Program Files\\sing-box\\sing-box.exe")
        );
    }

    #[test]
    fn test_parse_cim_process_json_array() {
        let array_json = r#"[
            {
                "ProcessId": 1234,
                "ParentProcessId": 500,
                "Name": "sing-box.exe",
                "CommandLine": "sing-box.exe run",
                "ExecutablePath": "C:\\bin\\sing-box.exe"
            },
            {
                "ProcessId": 5678,
                "ParentProcessId": 500,
                "Name": "singbox.exe",
                "CommandLine": null,
                "ExecutablePath": null
            }
        ]"#;

        let parsed = parse_cim_process_json(array_json);
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].process_id, Some(1234));
        assert_eq!(parsed[1].process_id, Some(5678));
        assert_eq!(parsed[1].name.as_deref(), Some("singbox.exe"));
    }

    #[test]
    fn test_tasklist_fallback_is_only_used_when_cim_query_failed() {
        assert!(!should_fallback_to_tasklist(true));
        assert!(should_fallback_to_tasklist(false));
    }

    #[test]
    fn test_filter_conflicting_processes_ignores_powershell_and_tools() {
        let items = vec![
            CimProcessItem {
                process_id: Some(2096),
                parent_process_id: Some(100),
                name: Some("powershell.exe".to_string()),
                command_line: Some(r#""powershell" -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name = 'sing-box.exe'\"""#.to_string()),
                executable_path: Some(r#"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"#.to_string()),
            },
            CimProcessItem {
                process_id: Some(3000),
                parent_process_id: Some(100),
                name: Some("cargo.exe".to_string()),
                command_line: Some("cargo run".to_string()),
                executable_path: Some(r#"C:\Users\pan\.cargo\bin\cargo.exe"#.to_string()),
            },
            CimProcessItem {
                process_id: Some(4000),
                parent_process_id: Some(100),
                name: Some("subout.exe".to_string()),
                command_line: Some("subout.exe web".to_string()),
                executable_path: Some(r#"C:\Subout\subout.exe"#.to_string()),
            },
        ];

        let filtered = filter_conflicting_processes(
            items,
            100,
            None,
            Path::new(r"C:\ProgramData\Subout\generated\sing-box.json"),
        );
        assert!(
            filtered.is_empty(),
            "All wrappers, powershell, cargo and subout processes must be filtered out"
        );
    }

    #[test]
    fn test_filter_conflicting_processes_ignores_managed_and_child_processes() {
        let current_pid = 5000;
        let managed_pid = 6000;
        let config_path = Path::new(r"C:\Subout\generated\sing-box.json");

        let items = vec![
            // Subout's current process
            CimProcessItem {
                process_id: Some(current_pid),
                parent_process_id: Some(100),
                name: Some("subout.exe".to_string()),
                command_line: Some("subout.exe".to_string()),
                executable_path: None,
            },
            // Subout's managed child sing-box instance
            CimProcessItem {
                process_id: Some(managed_pid),
                parent_process_id: Some(current_pid),
                name: Some("sing-box.exe".to_string()),
                command_line: Some(
                    r#"sing-box.exe -D C:\Subout run -c C:\Subout\generated\sing-box.json"#
                        .to_string(),
                ),
                executable_path: Some(r#"C:\Subout\bin\sing-box.exe"#.to_string()),
            },
            // Another child of current_pid
            CimProcessItem {
                process_id: Some(7000),
                parent_process_id: Some(current_pid),
                name: Some("sing-box.exe".to_string()),
                command_line: Some("sing-box.exe run".to_string()),
                executable_path: None,
            },
            // Real external conflict (e.g. system service or user manual terminal launch)
            CimProcessItem {
                process_id: Some(8888),
                parent_process_id: Some(1),
                name: Some("sing-box.exe".to_string()),
                command_line: Some(
                    r#"sing-box.exe run -c C:\etc\sing-box\config.json"#.to_string(),
                ),
                executable_path: Some(r#"C:\Program Files\sing-box\sing-box.exe"#.to_string()),
            },
        ];

        let filtered =
            filter_conflicting_processes(items, current_pid, Some(managed_pid), config_path);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].pid, 8888);
        assert_eq!(filtered[0].name, "sing-box.exe");
        assert_eq!(
            filtered[0].cmdline.as_deref(),
            Some(r#"sing-box.exe run -c C:\etc\sing-box\config.json"#)
        );
        assert_eq!(
            filtered[0].exe_path.as_deref(),
            Some(r#"C:\Program Files\sing-box\sing-box.exe"#)
        );
    }
}
