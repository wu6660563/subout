export const normalizeRouteRuleAction = (
  rule,
  availableOutboundTags = [],
) => {
  const normalized = JSON.parse(JSON.stringify(rule));
  if (normalized.action !== "route" && normalized.action) {
    delete normalized.outbound;
  } else {
    normalized.outbound =
      normalized.outbound || availableOutboundTags[0] || "direct";
  }
  return normalized;
};
