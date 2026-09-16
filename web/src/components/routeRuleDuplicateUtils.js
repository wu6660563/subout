export const CATEGORY_LABELS = {
  rule_set: "规则集 (rule_set)",
  domain: "精确域名 (domain)",
  domain_suffix: "域名后缀 (domain_suffix)",
  ip_cidr: "IP/CIDR (ip_cidr)",
  domain_keyword: "域名关键字 (domain_keyword)",
  domain_regex: "域名正则 (domain_regex)",
  geosite: "Geosite",
  geoip: "GeoIP",
  port: "端口 (port)",
  source_port: "源端口 (source_port)",
  protocol: "协议 (protocol)",
  inbound: "入站 Tag (inbound)",
  network: "网络类型 (network)",
  clash_mode: "Clash模式 (clash_mode)",
  process_name: "进程名称 (process_name)",
  process_path: "进程路径 (process_path)",
  process_path_regex: "进程正则 (process_path_regex)",
  package_name: "应用包名 (package_name)",
  user: "运行用户 (user)",
};

const CRITERIA_KEYS = Object.keys(CATEGORY_LABELS);

const normalizeCriteriaValue = (category, rawValue) => {
  let normValue = String(rawValue).trim().toLowerCase();
  let normCategory = category;

  if (category === "domain_suffix" || category === "domain") {
    normValue = normValue.replace(/^\.+/, "");
  } else if (category === "ip_cidr" && !normValue.includes("/")) {
    normValue += "/32";
  } else if (category === "rule_set") {
    if (normValue.startsWith("geosite-")) {
      normCategory = "geosite";
      normValue = normValue.replace(/^geosite-/, "");
    } else if (normValue.startsWith("geoip-")) {
      normCategory = "geoip";
      normValue = normValue.replace(/^geoip-/, "");
    }
  }

  return { normCategory, normValue };
};

export const extractCriteriaFromObj = (obj) => {
  if (!obj || typeof obj !== "object") return [];
  const items = [];

  CRITERIA_KEYS.forEach((key) => {
    const val = obj[key];
    if (val === undefined || val === null) return;
    const list = Array.isArray(val) ? val : [val];
    list.forEach((item) => {
      if (item === undefined || item === null || String(item).trim() === "") {
        return;
      }
      const rawValue = String(item).trim();
      const { normCategory, normValue } = normalizeCriteriaValue(key, rawValue);
      items.push({
        category: key,
        normCategory,
        typeLabel: CATEGORY_LABELS[key] || key,
        rawValue,
        normValue,
      });
    });
  });

  if (obj.type === "logical" && Array.isArray(obj.rules)) {
    obj.rules.forEach((subRule) => {
      items.push(...extractCriteriaFromObj(subRule));
    });
  }

  return items;
};

export const buildDuplicateRouteRulesInfo = (configData) => {
  const results = [];
  const map = new Map();
  const rules = configData?.route?.rules;

  if (Array.isArray(rules) && rules.length > 0) {
    rules.forEach((rule, idx) => {
      const outbound = rule.outbound || rule.action || "未配置出站";
      const ruleIndex = idx + 1;
      extractCriteriaFromObj(rule).forEach(
        ({ category, normCategory, typeLabel, rawValue, normValue }) => {
          const mapKey = `${normCategory}:${normValue}`;
          if (!map.has(mapKey)) {
            map.set(mapKey, {
              category,
              normCategory,
              typeLabel,
              value: rawValue,
              normValue,
              occurrences: [],
            });
          }
          map.get(mapKey).occurrences.push({ ruleIndex, outbound });
        },
      );
    });

    map.forEach((data) => {
      if (data.occurrences.length > 1) {
        const ruleIndices = [
          ...new Set(data.occurrences.map((occurrence) => occurrence.ruleIndex)),
        ];
        const outbounds = [
          ...new Set(data.occurrences.map((occurrence) => occurrence.outbound)),
        ];
        results.push({
          category: data.category,
          normCategory: data.normCategory,
          typeLabel: data.typeLabel,
          value: data.value,
          normValue: data.normValue,
          ruleIndices,
          outbounds,
          totalCount: data.occurrences.length,
        });
      }
    });
  }

  const ruleSetDeclarations = configData?.route?.rule_set;
  if (Array.isArray(ruleSetDeclarations)) {
    const tagCounts = new Map();
    ruleSetDeclarations.forEach((ruleSet, idx) => {
      if (!ruleSet || !ruleSet.tag) return;
      const tag = String(ruleSet.tag).trim();
      if (!tagCounts.has(tag)) tagCounts.set(tag, []);
      tagCounts.get(tag).push(idx + 1);
    });
    tagCounts.forEach((indices, tag) => {
      if (indices.length > 1) {
        results.push({
          category: "rule_set_decl",
          normCategory: "rule_set_decl",
          typeLabel: "规则集声明 (rule_set tag)",
          value: tag,
          normValue: tag.toLowerCase(),
          ruleIndices: indices,
          outbounds: ["规则集定义"],
          totalCount: indices.length,
        });
      }
    });
  }

  return results;
};

export const isDuplicateCriteriaItem = (duplicateInfo, category, rawValue) => {
  if (!rawValue || !duplicateInfo?.length) return false;
  const { normCategory, normValue } = normalizeCriteriaValue(category, rawValue);
  return duplicateInfo.some(
    (item) =>
      (item.category === category || item.normCategory === normCategory) &&
      item.normValue === normValue,
  );
};

export const hasDuplicateInField = (duplicateInfo, category, fieldValue) => {
  if (!fieldValue || !duplicateInfo?.length) return false;
  const list = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
  return list.some((value) =>
    isDuplicateCriteriaItem(duplicateInfo, category, value),
  );
};
