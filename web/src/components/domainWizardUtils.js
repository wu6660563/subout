const BASIC_OUTBOUND_TYPES = new Set(["direct", "block", "dns"]);
const GROUP_OUTBOUND_TYPES = new Set(["selector", "urltest"]);

const getGroupAverageLatency = (outbound, testResults) => {
  let totalLatency = 0;
  let count = 0;
  if (Array.isArray(outbound.outbounds)) {
    outbound.outbounds.forEach((memberTag) => {
      const result = testResults?.[memberTag];
      if (result?.latency !== null && result?.latency !== undefined) {
        totalLatency += result.latency;
        count++;
      }
    });
  }
  return count > 0 ? Math.round(totalLatency / count) : 99999;
};

export const getCommonSuffix = (domains) => {
  if (!domains || domains.length <= 1) return "";
  const domainParts = domains.map((domain) => domain.split(".").reverse());
  const minLength = Math.min(...domainParts.map((parts) => parts.length));
  const commonParts = [];

  for (let i = 0; i < minLength; i++) {
    const part = domainParts[0][i];
    if (domainParts.every((parts) => parts[i] === part)) {
      commonParts.push(part);
    } else {
      break;
    }
  }

  return commonParts.length > 0 ? commonParts.reverse().join(".") : "";
};

const DOMAIN_PATTERN =
  /^[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})+$/;

export const parseDomainWizardInput = (inputText) => {
  const domains = (inputText || "")
    .split(/[\n,\s]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (domains.length === 0) {
    return {
      domains,
      errorMsg: "",
      detectedType: "",
      extractedSuffix: "",
      testUrl: "",
    };
  }

  const invalidDomains = domains.filter((domain) => !DOMAIN_PATTERN.test(domain));
  if (invalidDomains.length > 0) {
    return {
      domains,
      errorMsg: `存在非法的域名格式: ${invalidDomains.join(", ")}`,
      detectedType: "",
      extractedSuffix: "",
      testUrl: "",
    };
  }

  if (domains.length === 1) {
    return {
      domains,
      errorMsg: "",
      detectedType: "precise",
      extractedSuffix: "",
      testUrl: domains[0],
    };
  }

  const extractedSuffix = getCommonSuffix(domains);
  if (!extractedSuffix) {
    return {
      domains,
      errorMsg:
        "这些域名没有共同的后缀（如都以 .com 或 google.com 结尾），无法作为范域名。请确保至少有 2 个且具有共同后缀的域名。",
      detectedType: "wildcard",
      extractedSuffix: "",
      testUrl: "",
    };
  }

  return {
    domains,
    errorMsg: "",
    detectedType: "wildcard",
    extractedSuffix,
    testUrl: domains[0],
  };
};

export const findMatchingDomainRouteRule = (routeRules, outboundTag) =>
  (routeRules || []).find(
    (rule) =>
      rule.outbound === outboundTag &&
      !rule.ip_cidr &&
      !rule.geoip &&
      !rule.geosite &&
      !rule.port &&
      !rule.protocol &&
      !rule.ip_is_private &&
      rule.type !== "logical",
  );

export const applyDomainWizardRule = ({
  routeRules,
  selectedOutbound,
  domains,
  detectedType,
  extractedSuffix,
  targetRuleAction,
}) => {
  const existingRules = Array.isArray(routeRules) ? routeRules : [];
  if (!selectedOutbound) {
    return { routeRules: existingRules, error: "请选择目标出站" };
  }
  if (!domains?.length) {
    return { routeRules: existingRules, error: "请输入待配置的域名" };
  }

  const fieldName = detectedType === "precise" ? "domain" : "domain_suffix";
  const targetValue =
    detectedType === "precise" ? domains[0] : extractedSuffix;
  if (!targetValue) {
    return { routeRules: existingRules, error: "范域名公共后缀为空，请重新输入" };
  }

  const ruleToMerge =
    targetRuleAction === "append"
      ? findMatchingDomainRouteRule(existingRules, selectedOutbound)
      : null;
  if (!ruleToMerge) {
    return {
      routeRules: [
        { outbound: selectedOutbound, [fieldName]: [targetValue] },
        ...existingRules,
      ],
      action: "created",
      fieldName,
      targetValue,
    };
  }

  const existingValues = Array.isArray(ruleToMerge[fieldName])
    ? ruleToMerge[fieldName]
    : [];
  if (existingValues.includes(targetValue)) {
    return {
      routeRules: existingRules,
      action: "already-exists",
      fieldName,
      targetValue,
    };
  }

  return {
    routeRules: existingRules.map((rule) =>
      rule === ruleToMerge
        ? { ...rule, [fieldName]: [...existingValues, targetValue] }
        : rule,
    ),
    action: "merged",
    fieldName,
    targetValue,
  };
};

export const calculateOutboundRecommendations = (outbounds, testResults) => {
  const proxyRankings = [];
  const groupRankings = [];

  (outbounds || []).forEach((outbound) => {
    if (!BASIC_OUTBOUND_TYPES.has(outbound.type) && !GROUP_OUTBOUND_TYPES.has(outbound.type)) {
      const latency = testResults?.[outbound.tag]?.latency;
      proxyRankings.push({
        tag: outbound.tag,
        type: outbound.type,
        latency: latency !== undefined && latency !== null ? latency : 99999,
      });
    } else if (GROUP_OUTBOUND_TYPES.has(outbound.type)) {
      groupRankings.push({
        tag: outbound.tag,
        type: outbound.type,
        latency: getGroupAverageLatency(outbound, testResults),
      });
    }
  });

  proxyRankings.sort((a, b) => a.latency - b.latency);
  groupRankings.sort((a, b) => a.latency - b.latency);

  const recommendedGroup = groupRankings.find(
    (group) => group.type === "urltest" && group.latency < 99999,
  );
  const recommendedNode = proxyRankings.find((proxy) => proxy.latency < 99999);

  let recommendedOutbound = "";
  let recommendationLog = "";
  if (recommendedGroup) {
    recommendedOutbound = recommendedGroup.tag;
    recommendationLog = `[系统推荐] 最佳自动测速策略组: ${recommendedOutbound} (平均延迟: ${recommendedGroup.latency}ms)`;
  } else if (recommendedNode) {
    recommendedOutbound = recommendedNode.tag;
    recommendationLog = `[系统推荐] 最佳代理节点: ${recommendedOutbound} (延迟: ${recommendedNode.latency}ms)`;
  } else {
    const urltestGroup = (outbounds || []).find(
      (outbound) => outbound.type === "urltest",
    );
    recommendedOutbound = urltestGroup ? urltestGroup.tag : "direct";
    recommendationLog = `[系统提示] 所有代理节点测速失败，已默认推荐: ${recommendedOutbound}`;
  }

  return {
    proxyRankings,
    groupRankings,
    recommendedOutbound,
    recommendationLog,
  };
};

export const buildSortedOutboundsForSelect = (
  outbounds,
  testResults,
  recommendedOutbound,
) => {
  const list = (outbounds || []).map((outbound) => {
    let latencyText = "";
    let sortKey = 999999;
    const isRecommended = outbound.tag === recommendedOutbound;

    if (GROUP_OUTBOUND_TYPES.has(outbound.type)) {
      const averageLatency = getGroupAverageLatency(outbound, testResults);
      if (averageLatency < 99999) {
        latencyText = `平均延迟: ${averageLatency}ms`;
        sortKey = averageLatency;
      } else {
        latencyText = "策略组 (未测速/全部失败)";
        sortKey = 888888;
      }
    } else if (!BASIC_OUTBOUND_TYPES.has(outbound.type)) {
      const latency = testResults?.[outbound.tag]?.latency;
      if (latency !== null && latency !== undefined) {
        latencyText = `延迟: ${latency}ms`;
        sortKey = latency;
      } else {
        latencyText = "代理节点 (测速失败/未测速)";
        sortKey = 888888;
      }
    } else {
      latencyText =
        outbound.type === "direct"
          ? "直连"
          : outbound.type === "block"
            ? "阻断"
            : "DNS";
      sortKey = 900000;
    }

    return {
      tag: outbound.tag,
      type: outbound.type,
      latencyText,
      sortKey,
      isRecommended,
    };
  });

  list.sort((a, b) => {
    if (a.isRecommended) return -1;
    if (b.isRecommended) return 1;
    return a.sortKey - b.sortKey;
  });
  return list;
};
