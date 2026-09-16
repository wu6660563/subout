export const getConfigItemList = (configData, type) => {
  if (type === "dns_server") return configData.dns.servers;
  if (type === "dns_rule") return configData.dns.rules;
  if (type === "inbound") return configData.inbounds;
  if (type === "outbound") return configData.outbounds;
  if (type === "route_rule") return configData.route.rules;
  if (type === "route_ruleset") return configData.route.rule_set;
  return null;
};
