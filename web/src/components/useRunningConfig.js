import { computed, reactive } from "vue";
import { formatRunningConfigLogs, isConfigRunning } from "./runningConfigUtils.js";

export const useRunningConfig = ({ apiBase, token, currentConfigId, sessionSudoPassword, setSessionSudoPassword, serviceStatus, fetchServiceStatus, systemModeInfo, promptDialog, showToast }) => {
  const runningConfig = reactive({ config_id: null, is_service_running: false, kernel_installed: false, kernel_version: "" });
  const runningConfigModal = reactive({ show: false, saving: false, viewMode: "form", status: "idle", logs: [], commandOutput: "", message: "" });
  const runningConfigForm = reactive({ config_id: null });
  const loadRunningConfigSettings = async () => {
    try { const res = await fetch(`${apiBase}/api/config/running`, { headers: { Authorization: `Bearer ${token.value}` } }); if (res.ok) { const data = await res.json(); Object.assign(runningConfig, { config_id: data.config_id, is_service_running: !!data.is_service_running, kernel_installed: !!data.kernel_installed, kernel_version: data.kernel_version }); } }
    catch (error) { console.error("加载运行设置失败", error); }
  };
  const openRunningConfigModal = () => {
    runningConfigForm.config_id = currentConfigId.value || runningConfig.config_id;
    Object.assign(runningConfigModal, { show: true, viewMode: "form", status: "idle", logs: [], commandOutput: "", message: "" });
  };
  const closeRunningConfigModal = () => { if (!runningConfigModal.saving) runningConfigModal.show = false; };
  const copyLogConsole = () => { if (runningConfigModal.logs?.length) { navigator.clipboard.writeText(formatRunningConfigLogs(runningConfigModal.logs)); showToast("执行日志已复制到剪贴板"); } };
  const isCurrentConfigRunning = computed(() => isConfigRunning(currentConfigId.value, runningConfig.config_id));
  const saveRunningConfigSettings = async (executeUpdate, customSudoPass = null) => {
    const sudoPass = typeof customSudoPass === "string" ? customSudoPass.trim() : sessionSudoPassword.value || null;
    const targetConfigId = runningConfigForm.config_id || currentConfigId.value;
    if (executeUpdate && !targetConfigId) return showToast("请先选择要运行的配置模板", "danger");
    if (executeUpdate) {
      runningConfigForm.config_id = targetConfigId;
      Object.assign(runningConfigModal, { viewMode: "log", saving: true, status: "running", logs: [{ step: "初始化", status: "info", message: "正在初始化 sing-box 运行配置更新流程...", timestamp: new Date().toLocaleTimeString("zh-CN", { hour12: false }) }], commandOutput: "", message: "" });
    } else runningConfigModal.saving = true;
    try {
      const response = await fetch(`${apiBase}/api/config/running`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.value}` }, signal: typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(60000) : undefined, body: JSON.stringify({ config_id: runningConfigForm.config_id, execute_update: executeUpdate, sudo_pass: sudoPass, takeover: Boolean(serviceStatus.value?.conflicting_processes?.length) }) });
      if (!response.ok) throw new Error((await response.text()) || "接口错误");
      const data = await response.json();
      if (!executeUpdate) { showToast("运行配置设置保存成功！"); await loadRunningConfigSettings(); closeRunningConfigModal(); return; }
      runningConfigModal.logs = Array.isArray(data.logs) ? data.logs : runningConfigModal.logs;
      runningConfigModal.commandOutput = data.command_output || "";
      if (data.status === "success") { Object.assign(runningConfigModal, { status: "success", message: data.message || "运行配置更新成功，服务已重启！" }); showToast("运行配置更新成功！"); if (sudoPass) setSessionSudoPassword(sudoPass); await fetchServiceStatus(); await loadRunningConfigSettings(); return; }
      Object.assign(runningConfigModal, { status: "failed", message: data.message || "运行配置更新失败" });
      const lower = (data.message || "").toLowerCase(); const isWindows = systemModeInfo.value?.os === "windows" || lower.includes("windows") || lower.includes("以管理员身份运行"); const permission = /sudo 密码|root|权限|tun|tunsetiff|permission denied|operation not permitted/.test(lower);
      if (permission && !isWindows) { setSessionSudoPassword(""); if (systemModeInfo.value) systemModeInfo.value.has_saved_sudo = false; const isWrongPass = /密码不正确|incorrect password|authentication failure/.test(lower); const promptMessage = isWrongPass ? "❌ 输入的 Sudo 密码不正确或已失效，请重新输入系统管理员密码：" : "🛡️ 应用运行配置需要系统管理员权限，请输入系统 Sudo / 管理员密码："; const pass = await promptDialog(promptMessage, "", { title: "需要管理员权限", confirmText: "授权并更新", inputType: "password", inputPlaceholder: "输入系统 Sudo 密码" }); if (pass?.trim()) { setSessionSudoPassword(pass.trim()); return saveRunningConfigSettings(true, pass.trim()); } showToast("已取消管理员提权授权", "warning"); }
      else showToast(data.message || "运行配置更新失败，请查看日志", "danger");
    } catch (error) {
      if (executeUpdate) { const isTimeout = error?.name === "TimeoutError"; runningConfigModal.logs.push({ step: "异常错误", status: "error", message: `运行配置更新请求失败: ${error.message || error}`, timestamp: new Date().toLocaleTimeString("zh-CN", { hour12: false }) }); Object.assign(runningConfigModal, { status: "failed", message: isTimeout ? "更新请求超时，请检查 sing-box 服务状态" : error.message || "请求处理失败" }); showToast(isTimeout ? "运行配置更新请求超时" : "运行配置更新失败", "danger"); }
      else showToast(`操作失败: ${error.message || error}`, "danger");
    } finally { runningConfigModal.saving = false; }
  };
  return { runningConfig, runningConfigModal, runningConfigForm, loadRunningConfigSettings, openRunningConfigModal, closeRunningConfigModal, copyLogConsole, isCurrentConfigRunning, saveRunningConfigSettings };
};
