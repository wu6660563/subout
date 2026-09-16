export const ITEM_ARRAY_FIELDS = [
  "domain",
  "domain_suffix",
  "domain_keyword",
  "domain_regex",
  "geosite",
  "geoip",
  "ip_cidr",
  "port",
  "inbound",
  "rule_set",
  "protocol",
  "outbounds",
  "process_name",
  "process_path",
  "process_path_regex",
  "package_name",
  "user",
];

export const ITEM_ARRAY_FIELDS_WITHOUT_PORT = ITEM_ARRAY_FIELDS.filter(
  (field) => field !== "port",
);

export const serializeItemDataForSource = (itemData, itemType) => {
  const cloned = JSON.parse(JSON.stringify(itemData));
  if (itemType === "outbound" && cloned.port !== undefined) {
    cloned.server_port = parseInt(cloned.port);
    delete cloned.port;
  }
  return cloned;
};

export const buildItemTempFields = (itemData, arrayFields) => {
  const tempFields = {};
  arrayFields.forEach((field) => {
    tempFields[field] = "";
    if (itemData[field] !== undefined && itemData[field] !== null) {
      tempFields[field] = Array.isArray(itemData[field])
        ? itemData[field].join("\n")
        : String(itemData[field]);
    }
  });
  return tempFields;
};

export const mergeLogicalRuleTempFields = (
  tempFields,
  subRules,
  arrayFields,
) => {
  const merged = { ...tempFields };
  if (!Array.isArray(subRules)) return merged;

  subRules.forEach((subRule) => {
    arrayFields.forEach((field) => {
      if (subRule[field] !== undefined && subRule[field] !== null) {
        const existing = merged[field] ? merged[field].split("\n") : [];
        const added = Array.isArray(subRule[field])
          ? subRule[field]
          : [String(subRule[field])];
        merged[field] = [...new Set([...existing, ...added])]
          .filter(Boolean)
          .join("\n");
      }
    });
  });

  return merged;
};

export const getOutboundGroupValidationError = (itemData) => {
  const groupTypes = [
    "selector",
    "urltest",
    "url-test",
    "fallback",
    "loadbalance",
  ];
  if (
    groupTypes.includes(itemData.type) &&
    (!Array.isArray(itemData.outbounds) || itemData.outbounds.length === 0)
  ) {
    return "出站组必须关联至少一个子出站/节点 (outbounds 列表不能为空)";
  }
  return "";
};

export const getDuplicateItemTagError = (
  itemType,
  data,
  configData,
  itemIndex,
) => {
  if (!["outbound", "inbound"].includes(itemType) || !data.tag) return "";

  const targetSection = itemType === "outbound" ? "outbounds" : "inbounds";
  const items = configData[targetSection] || [];
  const isDuplicate = items.some(
    (item, index) => index !== itemIndex && item.tag === data.tag,
  );

  return isDuplicate
    ? `标签 (tag) "${data.tag}" 重复，列表中已存在相同的 tag`
    : "";
};
