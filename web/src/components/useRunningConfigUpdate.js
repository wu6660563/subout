export const useRunningConfigUpdate = ({
  apiBase,
  token,
  currentConfigId,
  currentConfigDetail,
  runningConfig,
  runningConfigForm,
  isCurrentConfigRunning,
  getFullConfigData,
  validateFullConfigWithSingbox,
  loadAllSections,
  openRunningConfigModal,
  saveRunningConfigSettings,
  showToast,
}) => {
  const triggerUpdateFromDetail = async () => {
    if (!isCurrentConfigRunning.value) return;
    let fullData;
    try {
      fullData = getFullConfigData();
    } catch {
      return;
    }
    if (!(await validateFullConfigWithSingbox(fullData))) return;
    try {
      const response = await fetch(`${apiBase}/api/config/history/${currentConfigId.value}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.value}` },
        body: JSON.stringify({ detail: currentConfigDetail.value || "未命名配置", content: fullData }),
      });
      if (!response.ok) {
        showToast(`保存失败，已中断更新: ${(await response.text()) || "接口错误"}`, "danger");
        return;
      }
      showToast("配置已保存，开始执行运行更新...");
      await loadAllSections();
    } catch {
      showToast("保存配置网络请求失败，已中断更新", "danger");
      return;
    }
    openRunningConfigModal();
    runningConfigForm.config_id = currentConfigId.value || runningConfig.config_id;
    await saveRunningConfigSettings(true);
  };

  return { triggerUpdateFromDetail };
};
