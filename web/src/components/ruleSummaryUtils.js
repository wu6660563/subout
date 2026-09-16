const SUMMARY_CRITERIA_FIELDS = [
  "rule_set",
  "domain_suffix",
  "geosite",
  "domain",
  "domain_keyword",
  "domain_regex",
  "ip_cidr",
  "geoip",
  "process_name",
  "process_path",
  "process_path_regex",
  "package_name",
];

export const getRuleSummaryText = (rule, index, type) => {
  if (!rule) return "";
  const parts = [];
  if (type === "dns") {
    parts.push(`DNS: ${rule.server || "默认"}`);
  } else {
    parts.push(`Outbound: ${rule.outbound || rule.action || "未指定"}`);
  }

  if (rule.type === "logical") {
    parts.push(`[逻辑 ${rule.mode ? rule.mode.toUpperCase() : "OR"}]`);
  }

  const criteria = [];
  SUMMARY_CRITERIA_FIELDS.forEach((field) => {
    let value = rule[field];
    if (!value && rule.type === "logical" && Array.isArray(rule.rules)) {
      const nestedValues = rule.rules
        .map((subRule) => subRule[field])
        .filter(Boolean)
        .flat();
      if (nestedValues.length > 0) value = nestedValues;
    }
    if (value) {
      const values = Array.isArray(value) ? value : [value];
      criteria.push(
        `${field}: ${values.slice(0, 2).join(",")}${values.length > 2 ? "..." : ""}`,
      );
    }
  });

  const description = criteria.length > 0 ? criteria.join(" | ") : "全匹配规则";
  return `#${index + 1} (${parts.join(" - ")}) - ${description}`;
};
