export const useConfigLoader = ({
  apiBase,
  token,
  sections,
  configList,
  currentConfigId,
  currentConfigDetail,
  activeSection,
  isEditing,
  runningConfig,
  rawJson,
  outboundGroups,
  fetchSystemInfo,
  loadRunningConfigSettings,
  loadConfigList,
  parseConfigRoute,
  loadNodePoolCache,
  selectConfig,
  parseLog,
  parseDns,
  parseInbounds,
  parseOutbounds,
  parseRoute,
  parseExperimental,
  showToast,
}) => {
  const loadAllSections = async () => {
    await Promise.all([
      fetchSystemInfo(),
      (async () => {
        try {
          const response = await fetch(`${apiBase}/api/groups`, {
            headers: { Authorization: `Bearer ${token.value}` },
          });
          if (response.ok) outboundGroups.value = await response.json();
        } catch (error) {
          console.error("加载出站组失败", error);
        }
      })(),
      loadRunningConfigSettings(),
      loadConfigList(),
    ]);

    const routeState = parseConfigRoute();
    if (routeState.isEditing && routeState.configId) {
      const exists = configList.value.some((item) => item.id === routeState.configId);
      if (exists) {
        currentConfigId.value = routeState.configId;
        if (routeState.tab && sections.includes(routeState.tab)) activeSection.value = routeState.tab;
        await loadNodePoolCache();
        await selectConfig(routeState.configId);
        isEditing.value = true;
        return;
      }
      if (configList.value.length > 0) {
        showToast(`未找到 ID 为 #${routeState.configId} 的配置`, "warning");
        if (window.location.hash !== "#configs") window.history.replaceState(null, null, "#configs");
      }
    }

    isEditing.value = false;
    if (configList.value.length > 0) {
      const exists = configList.value.some((item) => item.id === currentConfigId.value);
      if (!exists) {
        currentConfigId.value = runningConfig.config_id && configList.value.some((item) => item.id === runningConfig.config_id)
          ? runningConfig.config_id
          : configList.value[0].id;
      }
      await selectConfig(currentConfigId.value);
      return;
    }

    currentConfigId.value = null;
    currentConfigDetail.value = "";
    Object.keys(rawJson).forEach((section) => { rawJson[section] = ""; });
    parseLog({}); parseDns({}); parseInbounds([]); parseOutbounds([]); parseRoute({}); parseExperimental({});
  };

  return { loadAllSections };
};
