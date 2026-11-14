# ==============================================================================
# subout - Proxy Subscription Converter & Sing-box Web Panel
# One-Click Install & Uninstall PowerShell Script for Windows
# ==============================================================================

[CmdletBinding(DefaultParameterSetName = "Default")]
param (
    [Parameter(Position = 0)]
    [ValidateSet("install", "uninstall", "help")]
    [string]$Action = "install",

    [ValidateRange(1, 65535)]
    [int]$Port = 1234,
    [string]$BinPath = "",
    [string]$BinDir = "C:\Program Files\Subout",
    [string]$DataDir = "C:\ProgramData\Subout",
    [string]$Tag = "",
    [string]$Version = "",
    [switch]$FromRelease,
    [switch]$Online,
    [switch]$NoService,
    [switch]$Uninstall,
    [switch]$Purge,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

# ------------------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------------------

function Show-Help {
    Write-Host "subout 一键安装与管理脚本 (Windows PowerShell)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "用法:"
    Write-Host "  .\install.ps1 [install|uninstall] [-Port <port>] [-BinPath <path>] [-NoService] [-Purge]"
    Write-Host ""
    Write-Host "也支持在 PowerShell (管理员) 中一键在线安装:"
    Write-Host "  irm https://raw.githubusercontent.com/geekdex/subout/main/install.ps1 | iex"
    Write-Host ""
    Write-Host "命令:"
    Write-Host "  install            安装 subout 并注册 Windows 开机自启后台任务 (默认命令)"
    Write-Host "  uninstall          卸载 subout 并停止/注销 Windows 后台任务"
    Write-Host ""
    Write-Host "参数:"
    Write-Host "  -Port <int>        指定 Web 面板监听端口 (默认: 1234)"
    Write-Host "  -BinPath <string>  指定本地 subout.exe 可执行文件路径"
    Write-Host "  -BinDir <string>   自定义安装目录 (默认: C:\Program Files\Subout)"
    Write-Host "  -DataDir <string>  自定义数据目录 (默认: C:\ProgramData\Subout)"
    Write-Host "  -Tag <string>      指定安装的 GitHub Release 版本标签 (如 v0.1.0)"
    Write-Host "  -Version <string>  -Tag 的兼容别名"
    Write-Host "  -FromRelease       强制从 GitHub Releases 下载预编译文件 (即使在源码目录中)"
    Write-Host "  -NoService         仅安装二进制文件，不注册 Windows 后台任务"
    Write-Host "  -Uninstall         卸载模式 (等同于 uninstall 命令)"
    Write-Host "  -Purge             卸载时彻底删除数据、日志与配置"
    Write-Host "  -Help              显示帮助信息"
    Write-Host ""
}

function Test-IsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)

    return $principal.IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator
    )
}

# Disable Windows system (WinINET/IE) proxy settings via registry.
# Called BEFORE stopping/killing the subout process so the system proxy is cleared
# even if Rust's graceful shutdown doesn't run (e.g. process is force-killed).
# Without this, all HTTP/HTTPS traffic would be routed through a dead port → disconnection.
function Disable-SystemProxy {
    try {
        $regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings"
        Set-ItemProperty -Path $regPath -Name "ProxyEnable" -Value 0 -ErrorAction SilentlyContinue
        # Notify WinINET of the change so running apps pick it up immediately.
        # Add-Type fails if the type already exists (e.g. the function is called more
        # than once in the same session), so register it only when missing instead of
        # silently losing the refresh notification.
        $typeName = "Win32.WinInet"
        if (-not ($typeName -as [type])) {
            $signature = @"
[DllImport("wininet.dll", SetLastError = true, CharSet = CharSet.Auto)]
public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);
"@
            Add-Type `
                -MemberDefinition $signature `
                -Name WinInet `
                -Namespace Win32 `
                -ErrorAction SilentlyContinue | Out-Null
        }
        $type = $typeName -as [type]
        if ($type) {
            # INTERNET_OPTION_SETTINGS_CHANGED = 39, INTERNET_OPTION_REFRESH = 37
            $type::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null
            $type::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null
        }
        Write-Host "  ✓ Windows 系统代理已清除" -ForegroundColor Green
    }
    catch {
        # Non-fatal: best-effort only
        Write-Host "  提示: 清除系统代理设置时出错 (非致命): $_" -ForegroundColor Yellow
    }
}

function Add-Argument {
    param (
        [System.Collections.Generic.List[string]]$List,
        [string]$Name,
        [string]$Value
    )

    $List.Add($Name)

    if ($Value -match '\s') {
        $List.Add("`"$Value`"")
    }
    else {
        $List.Add($Value)
    }
}

# Convert a possibly relative user-supplied path into an absolute one.
# Required because the script re-launches itself elevated via ShellExecute, whose
# working directory for the child process is not the caller's location.
function Resolve-AbsolutePath {
    param ([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $Path
    }

    $expanded = [Environment]::ExpandEnvironmentVariables($Path)

    if (-not [System.IO.Path]::IsPathRooted($expanded)) {
        $expanded = Join-Path $PWD.Path $expanded
    }

    try {
        return [System.IO.Path]::GetFullPath($expanded)
    }
    catch {
        return $expanded
    }
}

# Build the Task Scheduler XML definition for the background panel.
# Every interpolated value is XML-escaped: custom -BinDir / -DataDir paths may contain
# metacharacters (& < > "), which would otherwise abort task registration and surface
# as a misleading "please run as administrator" error.
function New-SuboutTaskXml {
    param (
        [Parameter(Mandatory = $true)][string]$TaskName,
        [Parameter(Mandatory = $true)][string]$ExePath,
        [Parameter(Mandatory = $true)][int]$Port,
        [Parameter(Mandatory = $true)][string]$DataDir,
        [string]$Description = "Subout Proxy Subscription Manager and Sing-box Web Panel"
    )

    $escape = {
        param ([string]$Value)
        if ([string]::IsNullOrEmpty($Value)) {
            return ""
        }
        return [System.Security.SecurityElement]::Escape($Value)
    }

    $xTaskName = & $escape $TaskName
    $xExePath = & $escape $ExePath
    $xDataDir = & $escape $DataDir
    $xDescription = & $escape $Description
    # --data-dir is mandatory: AppPaths resolves the data directory from the command line
    # (or %ProgramData%\Subout), NOT from the task's working directory. Without it a custom
    # -DataDir would be ignored by the app and -Purge would delete the wrong directory.
    $xArguments = & $escape ("web -p {0} --data-dir `"{1}`"" -f $Port, $DataDir)

    return @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>$xDescription</Description>
    <URI>\$xTaskName</URI>
  </RegistrationInfo>
  <Triggers>
    <BootTrigger>
      <Enabled>true</Enabled>
    </BootTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>S-1-5-18</UserId>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>true</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>4</Priority>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>3</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>$xExePath</Command>
      <Arguments>$xArguments</Arguments>
      <WorkingDirectory>$xDataDir</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@
}

# Terminate sing-box kernels that were launched by Subout (matched by the data
# directory on their command line). A forced task stop / Stop-Process does not run
# Rust destructors, so kill_on_drop never fires: the kernel survives as an orphan and
# keeps the TUN adapter and inbound ports busy, which makes the next start report a
# conflicting process. Only Subout's own kernels are matched - a user's unrelated
# sing-box installation is left alone.
function Stop-SuboutKernel {
    param (
        [AllowEmptyString()][string[]]$DataDirs = @()
    )

    $needles = @()

    foreach ($dir in $DataDirs) {
        if ([string]::IsNullOrWhiteSpace($dir)) {
            continue
        }

        $normalized = $dir.TrimEnd('\', '/').ToLowerInvariant()

        # Guard against killing every sing-box on the machine for degenerate paths
        # such as a bare drive root.
        if ($normalized.Length -lt 4 -or $normalized -match '^[a-z]:$') {
            continue
        }

        $needles += $normalized
    }

    if ($needles.Count -eq 0) {
        return
    }

    try {
        $candidates = Get-CimInstance `
            -ClassName Win32_Process `
            -Filter "Name = 'sing-box.exe' or Name = 'singbox.exe'" `
            -ErrorAction Stop
    }
    catch {
        Write-Host "  提示: 查询残留 sing-box 进程失败 (非致命): $_" -ForegroundColor Yellow
        return
    }

    $killed = @()

    foreach ($candidate in $candidates) {
        $cmdLine = $candidate.CommandLine

        if ([string]::IsNullOrWhiteSpace($cmdLine)) {
            continue
        }

        $lower = $cmdLine.ToLowerInvariant()

        foreach ($needle in $needles) {
            if ($lower.Contains($needle)) {
                try {
                    Stop-Process -Id $candidate.ProcessId -Force -ErrorAction Stop
                    $killed += $candidate.ProcessId
                }
                catch {
                    # Already exited / access denied: best effort.
                }
                break
            }
        }
    }

    if ($killed.Count -gt 0) {
        Write-Host "  ✓ 已终止 Subout 遗留的 sing-box 内核进程 (PID: $($killed -join ', '))" -ForegroundColor Green
    }
}

# Remove a temporary download directory (best effort, never fails the install).
function Remove-TempInstallDir {
    param ([string]$Path)

    if ($Path -and (Test-Path -LiteralPath $Path)) {
        Remove-Item `
            -LiteralPath $Path `
            -Recurse `
            -Force `
            -ErrorAction SilentlyContinue
    }
}

# -Purge deletes recursively, so never allow it to target a drive root or a well-known
# system directory (e.g. a typo such as -DataDir C:\Windows).
function Test-SafePurgeTarget {
    param ([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $false
    }

    try {
        $full = [System.IO.Path]::GetFullPath($Path)
    }
    catch {
        return $false
    }

    $normalized = $full.TrimEnd('\', '/')

    if ($normalized -match '^[A-Za-z]:$') {
        return $false
    }

    $blocked = @(
        $env:SystemRoot,
        $env:WINDIR,
        $env:ProgramFiles,
        ${env:ProgramFiles(x86)},
        $env:ProgramW6432,
        $env:ProgramData,
        $env:USERPROFILE
    ) | Where-Object { $_ } | ForEach-Object { $_.TrimEnd('\', '/') }

    foreach ($blockedPath in $blocked) {
        if ($normalized -eq $blockedPath) {
            return $false
        }
    }

    return $true
}

# Fast TCP check: Invoke-WebRequest can sit on its timeout even for a closed loopback
# port, which would make the readiness probe far too slow when nothing is listening.
function Test-PortListening {
    param (
        [Parameter(Mandatory = $true)][int]$Port,
        [int]$TimeoutMs = 300
    )

    $client = New-Object System.Net.Sockets.TcpClient

    try {
        $async = $client.BeginConnect([System.Net.IPAddress]::Loopback, $Port, $null, $null)

        if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
            return $false
        }

        $client.EndConnect($async)
        return $true
    }
    catch {
        return $false
    }
    finally {
        $client.Close()
    }
}

# Wait until the panel answers and return the port it actually bound.
# The app silently moves up to +10 ports when the requested port is busy
# (src/web/mod.rs: bind_available_listener), so the configured port is not
# necessarily the URL the user must open.
function Wait-SuboutPanel {
    param (
        [Parameter(Mandatory = $true)][int]$Port,
        [int]$Attempts = 10
    )

    for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
        for ($offset = 0; $offset -le 10; $offset++) {
            $candidate = $Port + $offset

            if ($candidate -gt 65535) {
                break
            }

            if (-not (Test-PortListening -Port $candidate)) {
                continue
            }

            try {
                $response = Invoke-WebRequest `
                    -Uri "http://127.0.0.1:$candidate/" `
                    -UseBasicParsing `
                    -TimeoutSec 2 `
                    -ErrorAction Stop

                if (
                    $response.StatusCode -eq 200 -and
                    $response.Content -match "Subout"
                ) {
                    return $candidate
                }
            }
            catch {
                # Listening, but not our panel / not ready yet.
            }
        }

        Start-Sleep -Milliseconds 500
    }

    return $null
}

# ------------------------------------------------------------------------------
# 1. Help
# ------------------------------------------------------------------------------

if ($Help -or $Action -eq "help") {
    Show-Help
    exit 0
}

# ------------------------------------------------------------------------------
# 2. Normalize action
# ------------------------------------------------------------------------------

if ($Action -eq "uninstall") {
    $Uninstall = $true
}

if ($Version -and -not $Tag) {
    $Tag = $Version
}

# ------------------------------------------------------------------------------
# 3. Require Administrator Privileges
# ------------------------------------------------------------------------------

if (-not (Test-IsAdmin)) {
    Write-Host "[提示] 需要管理员权限，正在请求 UAC 提权..." -ForegroundColor Yellow

    $scriptPath = $MyInvocation.MyCommand.Path
    $temporaryScript = $false

    # Normal local execution
    if ($scriptPath -and (Test-Path -LiteralPath $scriptPath)) {
        $elevatedScriptPath = $scriptPath
    }
    else {
        # irm | iex execution
        $elevatedScriptPath = Join-Path `
            $env:TEMP `
            "subout-install-$([Guid]::NewGuid().ToString('N')).ps1"

        try {
            $scriptUrl = "https://raw.githubusercontent.com/geekdex/subout/main/install.ps1"

            Write-Host "[提示] 当前通过远程脚本执行，正在准备临时安装文件..." -ForegroundColor Gray

            Invoke-WebRequest `
                -Uri $scriptUrl `
                -OutFile $elevatedScriptPath `
                -UseBasicParsing `
                -ErrorAction Stop

            $temporaryScript = $true
        }
        catch {
            Write-Host ""
            Write-Host "错误: 无法下载安装脚本。" -ForegroundColor Red
            Write-Host $_.Exception.Message -ForegroundColor Red
            exit 1
        }
    }

    # Build arguments.
    # Resolve user-supplied relative paths first: the elevated instance is started via
    # ShellExecute (UAC), whose working directory is not the caller's location, so a
    # relative -BinPath / -BinDir / -DataDir would resolve differently (usually to
    # C:\Windows\System32) and fail with a bogus "file not found" error.
    if ($BinPath) {
        $BinPath = Resolve-AbsolutePath -Path $BinPath
    }

    $BinDir = Resolve-AbsolutePath -Path $BinDir
    $DataDir = Resolve-AbsolutePath -Path $DataDir

    $argumentList = New-Object System.Collections.Generic.List[string]

    $argumentList.Add("-NoProfile")
    $argumentList.Add("-ExecutionPolicy")
    $argumentList.Add("Bypass")
    $argumentList.Add("-File")
    $argumentList.Add("`"$elevatedScriptPath`"")

    if ($Uninstall) {
        $argumentList.Add("uninstall")
    }
    else {
        $argumentList.Add("install")
    }

    if ($Purge) {
        $argumentList.Add("-Purge")
    }

    if ($NoService) {
        $argumentList.Add("-NoService")
    }

    if ($FromRelease -or $Online) {
        $argumentList.Add("-FromRelease")
    }

    if ($Tag) {
        Add-Argument -List $argumentList -Name "-Tag" -Value $Tag
    }

    if ($Port -ne 1234) {
        Add-Argument -List $argumentList -Name "-Port" -Value ([string]$Port)
    }

    if ($BinPath) {
        Add-Argument -List $argumentList -Name "-BinPath" -Value $BinPath
    }

    if ($BinDir -ne "C:\Program Files\Subout") {
        Add-Argument -List $argumentList -Name "-BinDir" -Value $BinDir
    }

    if ($DataDir -ne "C:\ProgramData\Subout") {
        Add-Argument -List $argumentList -Name "-DataDir" -Value $DataDir
    }

    $elevatedExitCode = 1

    try {
        # -Wait + -PassThru so the elevated run's exit code can be propagated:
        # without it a failed install (build error, task registration denied, ...)
        # still exits 0 and looks successful to callers and CI.
        $elevatedProcess = Start-Process `
            -FilePath "powershell.exe" `
            -Verb RunAs `
            -WorkingDirectory $PWD.Path `
            -ArgumentList ($argumentList -join " ") `
            -Wait `
            -PassThru `
            -ErrorAction Stop

        if ($null -ne $elevatedProcess) {
            $elevatedExitCode = $elevatedProcess.ExitCode
        }
    }
    catch {
        Write-Host ""
        Write-Host "错误: UAC 提权失败。" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        exit 1
    }
    finally {
        if (
            $temporaryScript -and
            $elevatedScriptPath -and
            (Test-Path -LiteralPath $elevatedScriptPath)
        ) {
            Remove-Item `
                -LiteralPath $elevatedScriptPath `
                -Force `
                -ErrorAction SilentlyContinue
        }
    }

    if ($elevatedExitCode -ne 0) {
        Write-Host ""
        Write-Host "错误: 管理员权限实例执行失败 (退出码: $elevatedExitCode)。" -ForegroundColor Red
    }

    exit $elevatedExitCode
}

# ------------------------------------------------------------------------------
# 4. System Architecture & Paths Setup
# ------------------------------------------------------------------------------

$AppName = "subout"
$TaskName = "Subout"
$ServiceName = "subout"
$TargetExe = Join-Path $BinDir "$AppName.exe"
$LogDir = Join-Path $DataDir "logs"
$RuntimeDir = Join-Path $DataDir "run"
$KernelDir = Join-Path $DataDir "bin"
$GeneratedDir = Join-Path $DataDir "generated"
$SubscriptionsDir = Join-Path $DataDir "subscriptions"
$NodesDir = Join-Path $DataDir "nodes"
$GitHubRepo = "geekdex/subout"

# Data directory the app falls back to when --data-dir is absent. Used when hunting
# leftover sing-box kernels, so a custom -DataDir still cleans up the default one too.
$SystemDataDir = if ($env:ProgramData) {
    Join-Path $env:ProgramData "Subout"
}
else {
    "C:\ProgramData\Subout"
}

$arch = $env:PROCESSOR_ARCHITECTURE

if ($arch -eq "ARM64") {
    $TargetTriple = "aarch64-pc-windows-msvc"
}
else {
    $TargetTriple = "x86_64-pc-windows-msvc"
}

# ------------------------------------------------------------------------------
# 5. UNINSTALL LOGIC (Requirement 1: 干净卸载)
# ------------------------------------------------------------------------------

if ($Uninstall) {
    Write-Host "======================================================" -ForegroundColor Cyan
    Write-Host "       正在卸载 subout 服务与相关文件...             " -ForegroundColor Cyan
    Write-Host "======================================================" -ForegroundColor Cyan
    Write-Host ""

    # 1. Stop and remove Windows Scheduled Task
    Write-Host "[1/3] 正在停止与注销 Windows 后台任务 ($TaskName)..." -ForegroundColor Blue

    # IMPORTANT: Clear system proxy BEFORE killing the subout process.
    # If subout has system proxy enabled, force-killing it leaves the proxy pointing at
    # a dead port → all HTTP/HTTPS traffic fails → long-term network disconnection.
    Write-Host "  正在清除 Windows 系统代理设置 (防止断网)..." -ForegroundColor Blue
    Disable-SystemProxy

    try {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    }
    catch {
        & schtasks.exe /End /TN $TaskName 2>$null | Out-Null
        & schtasks.exe /Delete /TN $TaskName /F 2>$null | Out-Null
    }

    # Clean up legacy Windows Service if present
    $service = Get-Service `
        -Name $ServiceName `
        -ErrorAction SilentlyContinue

    if ($service) {
        Write-Host "[2/3] 正在停止与注销旧版 Windows 服务 ($ServiceName)..." -ForegroundColor Blue

        Stop-Service `
            -Name $ServiceName `
            -Force `
            -ErrorAction SilentlyContinue

        Start-Sleep -Seconds 1

        & sc.exe delete $ServiceName 2>$null | Out-Null
        Start-Sleep -Seconds 1
    }
    else {
        Write-Host "[2/3] 旧版 Windows 服务已不存在，跳过。" -ForegroundColor Gray
    }

    # Stop any lingering processes
    Stop-Process -Name $AppName -Force -ErrorAction SilentlyContinue

    # A forced task stop never runs the Rust destructors, so the sing-box kernel that
    # Subout spawned survives as an orphan (keeping the TUN adapter and ports busy).
    # Kill only kernels whose command line points at a Subout data directory.
    Stop-SuboutKernel -DataDirs @($DataDir, $SystemDataDir)

    # 2. Remove binary
    if (Test-Path -LiteralPath $TargetExe) {
        Write-Host "[3/3] 正在删除可执行文件: $TargetExe" -ForegroundColor Blue

        Remove-Item `
            -LiteralPath $TargetExe `
            -Force `
            -ErrorAction SilentlyContinue
    }
    else {
        Write-Host "[3/3] 未找到 $TargetExe，跳过。" -ForegroundColor Gray
    }

    # Remove empty installation directory
    if (Test-Path -LiteralPath $BinDir) {
        $remainingFiles = @(
            Get-ChildItem `
                -LiteralPath $BinDir `
                -Force `
                -ErrorAction SilentlyContinue
        )

        if ($remainingFiles.Count -eq 0) {
            Remove-Item `
                -LiteralPath $BinDir `
                -Force `
                -ErrorAction SilentlyContinue
        }
    }

    # 3. Handle data directory
    if ($Purge) {
        if (Test-Path -LiteralPath $DataDir) {
            if (-not (Test-SafePurgeTarget -Path $DataDir)) {
                Write-Host ""
                Write-Host "错误: 拒绝删除该目录 (磁盘根目录或系统目录): $DataDir" -ForegroundColor Red
                Write-Host "已跳过 -Purge 清理，数据目录保持不变。" -ForegroundColor Yellow
            }
            else {
                Write-Host ""
                Write-Host "正在彻底清理数据、日志与配置目录 (--Purge): $DataDir" -ForegroundColor Yellow

                Remove-Item `
                    -LiteralPath $DataDir `
                    -Recurse `
                    -Force `
                    -ErrorAction SilentlyContinue

                # Removal failures are suppressed (locked files); verify instead of
                # printing success unconditionally.
                if (Test-Path -LiteralPath $DataDir) {
                    Write-Host "警告: 数据目录未能完全删除 (可能仍被占用)，请手动删除: $DataDir" -ForegroundColor Yellow
                }
                else {
                    Write-Host "✓ 数据与日志目录已清理完毕。" -ForegroundColor Green
                }
            }
        }
    }
    else {
        if (Test-Path -LiteralPath $DataDir) {
            Write-Host ""
            Write-Host "提示: 用户业务数据与配置已保留: $DataDir" -ForegroundColor Yellow
            Write-Host "如需彻底删除数据，请运行:" -ForegroundColor Yellow
            Write-Host "  .\install.ps1 uninstall -Purge" -ForegroundColor Gray
        }
    }

    Write-Host ""
    Write-Host "======================================================" -ForegroundColor Green
    Write-Host "✓ subout 卸载完成！" -ForegroundColor Green
    Write-Host "======================================================" -ForegroundColor Green

    exit 0
}

# ------------------------------------------------------------------------------
# 6. INSTALL LOGIC
# ------------------------------------------------------------------------------

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "        欢迎使用 subout 一键安装脚本 (Windows)        " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "架构目标: $TargetTriple" -ForegroundColor White
Write-Host "安装路径: $TargetExe" -ForegroundColor White
Write-Host "数据目录: $DataDir" -ForegroundColor White
Write-Host "日志目录: $LogDir" -ForegroundColor White
Write-Host "Web 端口: $Port" -ForegroundColor White
Write-Host ""

# ------------------------------------------------------------------------------
# 7. Locate or Download subout.exe
# ------------------------------------------------------------------------------

$SourceExe = $null
# Initialized here so the cleanup step below never depends on which branch ran.
$TmpDir = $null

$ScriptDir = $null
if ($PSScriptRoot -and (Test-Path -LiteralPath $PSScriptRoot)) {
    $ScriptDir = $PSScriptRoot
}

# ------------------------------------------------------------------------------
# 7.1 User specified binary
# ------------------------------------------------------------------------------

if ($BinPath) {
    if (Test-Path -LiteralPath $BinPath) {
        Write-Host "[1/4] 使用用户指定的二进制文件: $BinPath" -ForegroundColor Blue
        $SourceExe = (Resolve-Path -LiteralPath $BinPath).Path
    }
    else {
        Write-Host "错误: 指定的二进制文件不存在: $BinPath" -ForegroundColor Red
        exit 1
    }
}

# ------------------------------------------------------------------------------
# 7.2 Local source development build: pnpm build (web) + cargo build (root) (Requirement 2)
# ------------------------------------------------------------------------------

elseif ($ScriptDir -and (-not $FromRelease) -and (-not $Online)) {
    $CargoToml = Join-Path $ScriptDir "Cargo.toml"
    $WebPackageJson = Join-Path $ScriptDir "web\package.json"
    $SrcMainRs = Join-Path $ScriptDir "src\main.rs"

    if (
        (Test-Path -LiteralPath $CargoToml) -and
        (Test-Path -LiteralPath $WebPackageJson) -and
        (Test-Path -LiteralPath $SrcMainRs)
    ) {
        Write-Host "[1/4] 检测到本地源码仓库，正在执行完整开发编译构建..." -ForegroundColor Blue

        # Step 1.1: Build frontend UI in web directory (pnpm build)
        Write-Host "  -> [步骤 1/2] 进入 web 目录编译前端 UI (pnpm build)..." -ForegroundColor Blue
        $WebDir = Join-Path $ScriptDir "web"
        $WebNodeModules = Join-Path $WebDir "node_modules"
        $WebDistIndex = Join-Path $WebDir "dist\index.html"

        Push-Location $WebDir

        try {
            $hasPnpm = Get-Command pnpm -ErrorAction SilentlyContinue
            $hasNpm = Get-Command npm -ErrorAction SilentlyContinue

            if (-not $hasPnpm -and -not $hasNpm) {
                throw "未检测到 pnpm 或 npm。构建前端 UI 需要 Node.js 与 pnpm/npm 环境。请先安装 Node.js 与 pnpm。"
            }

            $pkgMgr = if ($hasPnpm) { "pnpm" } else { "npm" }

            if (-not $hasPnpm) {
                Write-Host "  提示: 系统未安装 pnpm，自动降级使用 npm 进行构建..." -ForegroundColor Yellow
            }

            # Install dependencies if node_modules missing
            if (-not (Test-Path -LiteralPath $WebNodeModules)) {
                Write-Host "  -> 前端依赖未初始化，正在执行 $pkgMgr install..." -ForegroundColor Blue
                & $pkgMgr install
                if ($LASTEXITCODE -ne 0) {
                    throw "$pkgMgr install 执行失败，退出码: $LASTEXITCODE"
                }
            }

            # Run build
            if ($pkgMgr -eq "pnpm") {
                & pnpm build
            }
            else {
                & npm run build
            }

            if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $WebDistIndex)) {
                throw "前端 UI 构建失败，未生成 $WebDistIndex"
            }

            Write-Host "  ✓ 前端 UI 构建完成 ($WebDistIndex)" -ForegroundColor Green
        }
        finally {
            Pop-Location
        }

        # Step 1.2: Build backend with Cargo
        Write-Host "  -> [步骤 2/2] 返回项目根目录编译后端 (cargo build --release)..." -ForegroundColor Blue

        $hasCargo = Get-Command cargo -ErrorAction SilentlyContinue
        if (-not $hasCargo) {
            throw "未检测到 cargo 命令。请先安装 Rust 工具链 (https://rustup.rs)。"
        }

        Push-Location $ScriptDir

        try {
            & cargo build --release

            if ($LASTEXITCODE -ne 0) {
                throw "cargo build --release 执行失败，退出码: $LASTEXITCODE"
            }
        }
        finally {
            Pop-Location
        }

        $TargetReleaseExe = Join-Path $ScriptDir "target\release\$AppName.exe"
        if (Test-Path -LiteralPath $TargetReleaseExe) {
            $SourceExe = $TargetReleaseExe
            Write-Host "  ✓ 本地构建成功: $SourceExe" -ForegroundColor Green
        }
        else {
            throw "未找到编译生成的二进制文件: $TargetReleaseExe"
        }
    }
}

# ------------------------------------------------------------------------------
# 7.3 Download latest GitHub Release (Requirement 3)
# ------------------------------------------------------------------------------

if (-not $SourceExe) {
    Write-Host "[1/4] 正在从 GitHub Releases 获取预编译版本 ($TargetTriple)..." -ForegroundColor Blue

    $TmpDir = Join-Path `
        $env:TEMP `
        "subout_install_$([Guid]::NewGuid().ToString('N'))"

    New-Item `
        -ItemType Directory `
        -Force `
        -Path $TmpDir | Out-Null

    try {
        $LatestTag = $Tag

        if (-not $LatestTag) {
            Write-Host "  正在查询最新 Release 版本号..." -ForegroundColor Gray
            try {
                $ReleaseInfo = Invoke-RestMethod `
                    -Uri "https://api.github.com/repos/$GitHubRepo/releases/latest" `
                    -Headers @{ "User-Agent" = "subout-installer" } `
                    -ErrorAction Stop

                $LatestTag = $ReleaseInfo.tag_name
            }
            catch {
                # Fallback header location redirect
                $req = [System.Net.WebRequest]::Create("https://github.com/$GitHubRepo/releases/latest")
                $req.Method = "HEAD"
                $req.AllowAutoRedirect = $false
                try {
                    $resp = $req.GetResponse()
                    $loc = $resp.GetResponseHeader("Location")
                    if ($loc -match 'tag/(.+)$') {
                        $LatestTag = $matches[1].Trim()
                    }
                    $resp.Close()
                }
                catch {
                    # Ignore
                }
            }
        }

        if (-not $LatestTag) {
            throw "未能获取 GitHub 最新版本标签。请检查网络连接或使用 -Tag 参数指定版本 (如: -Tag v0.1.0)。"
        }

        $ArchiveName = "subout-$LatestTag-$TargetTriple.zip"
        $DownloadUrl = "https://github.com/$GitHubRepo/releases/download/$LatestTag/$ArchiveName"

        Write-Host "  版本标签 : $LatestTag" -ForegroundColor Cyan
        Write-Host "  下载文件 : $ArchiveName" -ForegroundColor Cyan
        Write-Host "  下载地址 : $DownloadUrl" -ForegroundColor Cyan

        $ZipPath = Join-Path $TmpDir "subout.zip"

        Write-Host "正在下载预编译产物..." -ForegroundColor Gray
        Invoke-WebRequest `
            -Uri $DownloadUrl `
            -OutFile $ZipPath `
            -UseBasicParsing `
            -ErrorAction Stop

        Write-Host "正在解压产物..." -ForegroundColor Gray
        Expand-Archive `
            -Path $ZipPath `
            -DestinationPath $TmpDir `
            -Force

        $ExtractedExe = Join-Path $TmpDir "$AppName.exe"

        if (-not (Test-Path -LiteralPath $ExtractedExe)) {
            # In case the zip contains a subdirectory, search recursively.
            $FoundExe = Get-ChildItem `
                -Path $TmpDir `
                -Filter "$AppName.exe" `
                -File `
                -Recurse `
                -ErrorAction SilentlyContinue |
                Select-Object -First 1

            if ($FoundExe) {
                $ExtractedExe = $FoundExe.FullName
            }
        }

        if (Test-Path -LiteralPath $ExtractedExe) {
            $SourceExe = $ExtractedExe
            Write-Host "  ✓ 预编译产物下载并解压成功。" -ForegroundColor Green
        }
        else {
            throw "解压后的文件中未找到 $AppName.exe"
        }
    }
    catch {
        Write-Host ""
        Write-Host "错误: 从 GitHub Releases 下载或解压预编译二进制文件失败。" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red

        Remove-TempInstallDir -Path $TmpDir

        exit 1
    }
}

# ------------------------------------------------------------------------------
# 8. Validate binary
# ------------------------------------------------------------------------------

if (
    -not $SourceExe -or
    -not (Test-Path -LiteralPath $SourceExe)
) {
    Write-Host ""
    Write-Host "错误: 未能找到有效的 subout.exe 文件。" -ForegroundColor Red
    Remove-TempInstallDir -Path $TmpDir
    exit 1
}

# ------------------------------------------------------------------------------
# 9. Copy Binary to Installation Directory
# ------------------------------------------------------------------------------

Write-Host "[2/4] 正在安装二进制文件到 $TargetExe..." -ForegroundColor Blue

# IMPORTANT: clear the system proxy BEFORE the first kill.
# Killing subout while it has the system proxy enabled leaves WinINET pointing at a
# dead port (no traffic at all). The graceful shutdown that would restore it cannot
# run here: the scheduled task is stopped with a hard terminate and the process is
# killed with -Force. Clearing first also covers -NoService, which never reaches
# step 11.
Write-Host "  正在清除 Windows 系统代理设置 (防止断网)..." -ForegroundColor Blue
Disable-SystemProxy

# Stop running background task and processes before copying to avoid file lock
try {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
} catch {}
Stop-Process -Name $AppName -Force -ErrorAction SilentlyContinue

# Kill the orphan sing-box kernel left behind by the forced stop (see Stop-SuboutKernel).
Stop-SuboutKernel -DataDirs @($DataDir, $SystemDataDir)
Start-Sleep -Milliseconds 500

if (-not (Test-Path -LiteralPath $BinDir)) {
    New-Item `
        -ItemType Directory `
        -Force `
        -Path $BinDir | Out-Null
}

Copy-Item `
    -LiteralPath $SourceExe `
    -Destination $TargetExe `
    -Force

# Clear the "downloaded from the internet" mark (MOTW) inherited from the release zip,
# otherwise running the exe manually later can trigger a SmartScreen prompt.
Unblock-File -LiteralPath $TargetExe -ErrorAction SilentlyContinue

# ------------------------------------------------------------------------------
# 10. Create Data, Kernel & Logs Directory
# ------------------------------------------------------------------------------

Write-Host "[3/4] 正在初始化数据与日志目录 ($DataDir)..." -ForegroundColor Blue

foreach ($dir in @(
    $DataDir,
    $KernelDir,
    $GeneratedDir,
    $SubscriptionsDir,
    $NodesDir,
    $LogDir,
    $RuntimeDir
)) {
    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item `
            -ItemType Directory `
            -Force `
            -Path $dir | Out-Null
    }
}

# Restrict the data directory to SYSTEM, Administrators and the installing user.
# %ProgramData% is readable by every local user, and this directory holds subscription
# tokens, node credentials and the generated sing-box config (which contains them all).
$currentUserSid = $null
try {
    $currentUserSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
} catch {}

$aclFailures = 0

$aclTargets = @(
    $DataDir,
    $KernelDir,
    $GeneratedDir,
    $SubscriptionsDir,
    $NodesDir,
    $LogDir,
    $RuntimeDir
)

$grantArgs = @(
    "/inheritance:r",
    "/grant:r",
    "*S-1-5-18:(OI)(CI)F",      # NT AUTHORITY\SYSTEM
    "*S-1-5-32-544:(OI)(CI)F"   # BUILTIN\Administrators
)

if ($currentUserSid -and $currentUserSid -match '^S-1-') {
    $grantArgs += "*${currentUserSid}:(OI)(CI)F"
}

foreach ($target in $aclTargets) {
    if (Test-Path -LiteralPath $target) {
        & icacls.exe $target @grantArgs /T /C *> $null
        if ($LASTEXITCODE -ne 0) {
            $aclFailures++
        }
    }
}

if ($aclFailures -eq 0) {
    Write-Host "  ✓ 数据目录权限已收紧 (仅 SYSTEM / Administrators / 当前用户)" -ForegroundColor Green
}
else {
    Write-Host "  提示: 收紧数据目录 ACL 失败 (非致命)，凭据文件可能对本地其他用户可读。" -ForegroundColor Yellow
}

# Check sing-box existence in system
$hasSingBox = Get-Command sing-box -ErrorAction SilentlyContinue

if ($hasSingBox) {
    Write-Host "✓ 检测到系统中已存在 sing-box: $($hasSingBox.Source)" -ForegroundColor Green
}
else {
    Write-Host "提示: 当前系统 PATH 中未检测到 sing-box 内核。" -ForegroundColor Yellow
    Write-Host "  可在 Web 控制面板中一键在线下载，将自动保存至 $KernelDir\sing-box.exe。" -ForegroundColor Gray
}

# ------------------------------------------------------------------------------
# 11. Configure & Start Windows Background Task
# ------------------------------------------------------------------------------

# Port the panel is expected to listen on; corrected by the readiness probe below.
$ActualPort = $Port

if ($NoService) {
    # -NoService must also disarm a previously installed boot task: otherwise the old
    # task keeps auto-starting the panel (with the old port/data dir) after a reboot,
    # which is the opposite of what -NoService promises.
    try {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    }
    catch {
        & schtasks.exe /End /TN $TaskName 2>$null | Out-Null
        & schtasks.exe /Delete /TN $TaskName /F 2>$null | Out-Null
    }

    Write-Host "[4/4] 已跳过 Windows 后台任务配置 (-NoService)。" -ForegroundColor Yellow
}
else {
    Write-Host "[4/4] 正在配置 Windows 开机自启后台任务 ($TaskName)..." -ForegroundColor Blue

    # 1. Stop and remove existing task & legacy service.
    # The system proxy was already cleared in step 9, before the first kill.
    try {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    }
    catch {
        & schtasks.exe /End /TN $TaskName 2>$null | Out-Null
        & schtasks.exe /Delete /TN $TaskName /F 2>$null | Out-Null
    }

    $existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($existingService) {
        Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
        & sc.exe delete $ServiceName 2>$null | Out-Null
    }

    # Stop lingering processes
    Stop-Process -Name $AppName -Force -ErrorAction SilentlyContinue
    Stop-SuboutKernel -DataDirs @($DataDir, $SystemDataDir)
    Start-Sleep -Milliseconds 500

    # 2. Register Windows Scheduled Task using canonical XML definition
    # Using Task Scheduler XML schema guarantees 100% reliability across all Windows versions
    # and eliminates all command-line quoting/escaping issues with spaces in file paths.
    # The XML is built (and escaped) by New-SuboutTaskXml; --data-dir is passed explicitly
    # because the app resolves its data directory from the CLI, not from WorkingDirectory.
    $taskXml = New-SuboutTaskXml `
        -TaskName $TaskName `
        -ExePath $TargetExe `
        -Port $Port `
        -DataDir $DataDir

    $taskRegistered = $false

    # Method 1: Register-ScheduledTask -Xml
    try {
        Register-ScheduledTask -TaskName $TaskName -Xml $taskXml -Force -ErrorAction Stop | Out-Null
        $taskRegistered = $true
    }
    catch {
        # Method 2: Fallback to schtasks.exe /Create /XML with temporary UTF-16 XML file
        $xmlTempPath = Join-Path $env:TEMP "subout_task_$([Guid]::NewGuid().ToString('N')).xml"
        try {
            [System.IO.File]::WriteAllText($xmlTempPath, $taskXml, [System.Text.Encoding]::Unicode)
            & schtasks.exe /Create /TN $TaskName /XML $xmlTempPath /F | Out-Null
            if ($LASTEXITCODE -eq 0) {
                $taskRegistered = $true
            }
        }
        finally {
            if (Test-Path -LiteralPath $xmlTempPath) {
                Remove-Item -LiteralPath $xmlTempPath -Force -ErrorAction SilentlyContinue
            }
        }
    }

    if (-not $taskRegistered) {
        throw "无法注册 Windows 后台任务 ($TaskName)。请确保在【以管理员身份运行】的 PowerShell 中执行。"
    }

    # 3. Start task
    $started = $false
    try {
        Start-ScheduledTask -TaskName $TaskName -ErrorAction Stop | Out-Null
        $started = $true
    }
    catch {
        & schtasks.exe /Run /TN $TaskName 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $started = $true
        }
    }

    Start-Sleep -Seconds 1

    # Verify task / process status
    $suboutProc = Get-Process -Name $AppName -ErrorAction SilentlyContinue
    if ($suboutProc) {
        Write-Host "✓ Windows 后台守护任务已注册并运行 (PID: $($suboutProc.Id -join ', '))" -ForegroundColor Green
    }
    else {
        Write-Host "✓ Windows 后台守护任务已注册并启动 ($TaskName)" -ForegroundColor Green
    }

    # Confirm the panel actually answers. The app silently moves up to +10 ports when
    # the configured port is busy, so the configured port may not be the live one.
    $listeningPort = Wait-SuboutPanel -Port $Port
    if ($listeningPort) {
        $ActualPort = $listeningPort
        if ($listeningPort -ne $Port) {
            Write-Host "  提示: 端口 $Port 已被占用，面板实际运行在端口 $listeningPort。" -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "  警告: 未在 http://127.0.0.1:$Port 检测到面板响应。" -ForegroundColor Yellow
        Write-Host "        请查看任务结果: Get-ScheduledTaskInfo -TaskName $TaskName" -ForegroundColor Gray
    }
}

# ------------------------------------------------------------------------------
# 12. Cleanup temporary download directory
# ------------------------------------------------------------------------------

Remove-TempInstallDir -Path $TmpDir

# ------------------------------------------------------------------------------
# 13. Summary
# ------------------------------------------------------------------------------

Write-Host ""
Write-Host "======================================================" -ForegroundColor Green
Write-Host "🎉 subout 安装成功！" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
Write-Host "📍 Web 管理面板地址 : http://127.0.0.1:$ActualPort" -ForegroundColor Cyan
Write-Host "🔑 首次启动          : 打开面板后设置管理员密码" -ForegroundColor White
Write-Host "💾 持久化数据目录   : $DataDir" -ForegroundColor White
Write-Host "📝 系统日志目录     : $LogDir" -ForegroundColor White
Write-Host ""

if (-not $NoService) {
    Write-Host "常用后台管理命令 (PowerShell 管理员):" -ForegroundColor White
    Write-Host "  • 查看运行状态 : Get-ScheduledTask -TaskName Subout" -ForegroundColor Gray
    Write-Host "  • 启动后台任务 : Start-ScheduledTask -TaskName Subout" -ForegroundColor Gray
    Write-Host "  • 停止后台任务 : Stop-ScheduledTask -TaskName Subout" -ForegroundColor Gray
    Write-Host "  • 重启后台任务 : Stop-ScheduledTask -TaskName Subout; Start-ScheduledTask -TaskName Subout" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "一键卸载命令 (PowerShell):" -ForegroundColor White
Write-Host "  .\install.ps1 uninstall" -ForegroundColor Gray
Write-Host "  .\install.ps1 uninstall -Purge" -ForegroundColor Gray
Write-Host ""
