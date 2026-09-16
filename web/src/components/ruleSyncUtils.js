const SYNC_FIELDS = [
  "rule_set",
  "domain_suffix",
  "geosite",
  "domain",
  "domain_keyword",
  "domain_regex",
  "port",
  "inbound",
  "protocol",
  "process_name",
  "process_path",
  "process_path_regex",
  "package_name",
  "user",
];

const cloneValue = (value) => JSON.parse(JSON.stringify(value));

export const buildSyncedRule = (
  sourceRule,
  direction,
  {
    targetDnsServer,
    targetClientSubnet,
    targetRouteAction,
    targetRouteOutbound,
  } = {},
) => {
  const source = cloneValue(sourceRule || {});
  const isToDns = direction === "route_to_dns";
  let syncedRule = {};

  if (source.type === "logical" && Array.isArray(source.rules)) {
    syncedRule.type = "logical";
    syncedRule.mode = source.mode || "or";
    syncedRule.rules = source.rules
      .map((subRule) => {
        const cleanSubRule = {};
        SYNC_FIELDS.forEach((field) => {
          if (subRule[field] !== undefined && subRule[field] !== null) {
            cleanSubRule[field] = cloneValue(subRule[field]);
          }
        });
        if (!isToDns) {
          ["ip_cidr", "geoip"].forEach((field) => {
            if (subRule[field] !== undefined && subRule[field] !== null) {
              cleanSubRule[field] = cloneValue(subRule[field]);
            }
          });
        }
        return cleanSubRule;
      })
      .filter((subRule) => Object.keys(subRule).length > 0);
  } else {
    SYNC_FIELDS.forEach((field) => {
      if (source[field] !== undefined && source[field] !== null) {
        syncedRule[field] = cloneValue(source[field]);
      }
    });
    if (!isToDns) {
      ["ip_cidr", "geoip", "ip_is_private"].forEach((field) => {
        if (source[field] !== undefined && source[field] !== null) {
          syncedRule[field] = cloneValue(source[field]);
        }
      });
    }
  }

  if (source.invert !== undefined) syncedRule.invert = source.invert;

  if (isToDns) {
    syncedRule.server = targetDnsServer || "local-dns";
    if (targetClientSubnet && targetClientSubnet.trim()) {
      syncedRule.client_subnet = targetClientSubnet.trim();
    }
  } else {
    if (targetRouteAction) syncedRule.action = targetRouteAction;
    if (
      (!syncedRule.action || syncedRule.action === "route") &&
      targetRouteOutbound
    ) {
      syncedRule.action = "route";
      syncedRule.outbound = targetRouteOutbound;
    }
  }

  return syncedRule;
};

export const getRuleSyncValidationError = ({
  direction,
  targetDnsServer,
  targetRouteAction,
  targetRouteOutbound,
}) => {
  const isToDns = direction === "route_to_dns";
  if (!isToDns && targetRouteAction === "route" && !targetRouteOutbound) {
    return "请选择目标出站 Tag (outbound)";
  }
  if (isToDns && !targetDnsServer) {
    return "请选择目标 DNS 服务器 Tag (server)";
  }
  return "";
};
