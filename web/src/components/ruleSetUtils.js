export const normalizeRuleSetForType = (ruleSet, availableOutboundTags = []) => {
  const normalized = JSON.parse(JSON.stringify(ruleSet));

  if (normalized.type === "remote") {
    normalized.url = normalized.url || "";
    normalized.format = normalized.format || "binary";
    normalized.download_detour =
      normalized.download_detour ||
      (availableOutboundTags.includes("proxy")
        ? "proxy"
        : availableOutboundTags[0] || "direct");
    normalized.update_interval = normalized.update_interval || "1d";
    delete normalized.path;
  } else {
    normalized.path = normalized.path || "";
    delete normalized.url;
    delete normalized.download_detour;
    delete normalized.update_interval;
  }

  return normalized;
};
