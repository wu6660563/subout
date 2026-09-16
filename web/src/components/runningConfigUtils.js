export const formatRunningConfigLogs = (logs) => {
  if (!logs || logs.length === 0) return "";
  return logs
    .map(
      (log) =>
        `[${log.timestamp}] [${log.step}] [${(log.status || "").toUpperCase()}] ${log.message}`,
    )
    .join("\n");
};

export const getRunningConfigName = (configs, id) => {
  const config = configs.find((item) => item.id === id);
  return config ? config.detail || "未命名配置" : "未知配置";
};

export const isConfigRunning = (currentConfigId, runningConfigId) =>
  currentConfigId !== null &&
  currentConfigId !== undefined &&
  runningConfigId !== null &&
  runningConfigId !== undefined &&
  String(currentConfigId) === String(runningConfigId);
