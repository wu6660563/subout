export const useItemEditorLifecycle = ({
  itemModal,
  configData,
  presetUrlSelectConfig,
  ITEM_ARRAY_FIELDS,
  buildItemTempFields,
  mergeLogicalRuleTempFields,
}) => {
const addInbound = () => {
  const newItem = {
    tag: "inbound-" + (configData.inbounds.length + 1),
    type: "mixed",
    listen: "::",
    listen_port: 2334,
  };
  editItem(newItem, "inbound", (parsed) => {
    configData.inbounds.push(parsed);
  });
};

const editItem = (item, type, onSaveCallback, idx = -1) => {
  itemModal.itemType = type;
  itemModal.mode = "visual";
  itemModal.error = "";
  itemModal.onSave = onSaveCallback;
  itemModal.idx = idx;

  if (type === "dns_server") itemModal.title = "编辑 DNS 服务器";
  else if (type === "dns_rule") itemModal.title = "编辑 DNS 分流规则";
  else if (type === "inbound") itemModal.title = "编辑入站连接 (Inbound)";
  else if (type === "outbound") itemModal.title = "编辑出站连接 (Outbound)";
  else if (type === "route_rule") itemModal.title = "编辑分流路由规则";
  else if (type === "route_ruleset") itemModal.title = "编辑规则集 (RuleSet)";

  itemModal.itemData = JSON.parse(JSON.stringify(item));

  if (["route_rule", "dns_rule"].includes(type)) {
    if (itemModal.itemData.type === "logical") {
      itemModal.routeRuleLogic = itemModal.itemData.mode || "or";
    } else {
      itemModal.routeRuleLogic = "standard";
    }
  }

  if (type === "dns_rule") {
    if (itemModal.itemData.type === "logical") {
      itemModal.dnsRuleType = "logical";
    } else if (itemModal.itemData.rule_set || itemModal.itemData.geosite) {
      itemModal.dnsRuleType = "rule_set";
    } else if (itemModal.itemData.domain_suffix) {
      itemModal.dnsRuleType = "domain_suffix";
    } else {
      const hasOtherFields = [
        "domain",
        "domain_keyword",
        "domain_regex",
        "geoip",
        "ip_cidr",
        "port",
        "inbound",
      ].some(
        (f) =>
          itemModal.itemData[f] !== undefined && itemModal.itemData[f] !== null,
      );
      if (hasOtherFields) {
        itemModal.dnsRuleType = "advanced";
      } else {
        itemModal.dnsRuleType = "domain_suffix";
      }
    }
  }

  const arrayFields = ITEM_ARRAY_FIELDS;
  Object.assign(
    itemModal.tempFields,
    buildItemTempFields(itemModal.itemData, arrayFields),
  );

  if (
    ["route_rule", "dns_rule"].includes(type) &&
    itemModal.itemData.type === "logical" &&
    Array.isArray(itemModal.itemData.rules)
  ) {
    Object.assign(
      itemModal.tempFields,
      mergeLogicalRuleTempFields(
        itemModal.tempFields,
        itemModal.itemData.rules,
        arrayFields,
      ),
    );
  }

  if (type === "inbound" && !itemModal.itemData.type) {
    itemModal.itemData.type = "mixed";
  }
  if (type === "dns_server" && !itemModal.itemData.type) {
    itemModal.itemData.type = "udp";
  }
  if (type === "route_ruleset" && !itemModal.itemData.type) {
    itemModal.itemData.type = "remote";
  }
  if (type === "outbound") {
    if (!itemModal.itemData.type) {
      itemModal.itemData.type = "direct";
    }
    if (
      itemModal.itemData.server_port !== undefined &&
      itemModal.itemData.port === undefined
    ) {
      itemModal.itemData.port = itemModal.itemData.server_port;
    }
    if (!itemModal.itemData.tls) {
      itemModal.itemData.tls = {
        enabled: false,
        server_name: "",
        insecure: false,
      };
    }
    if (!itemModal.itemData.tls.reality) {
      itemModal.itemData.tls.reality = {
        enabled: false,
        public_key: "",
        short_id: "",
      };
    }
    if (!itemModal.itemData.transport) {
      itemModal.itemData.transport = { type: "", path: "", service_name: "" };
    }
    if (itemModal.itemData.type === "urltest") {
      const presets = [
        "http://cp.cloudflare.com/generate_204",
        "http://www.gstatic.com/generate_204",
        "http://connectivitycheck.gstatic.com/generate_204",
        "http://captive.apple.com/hotspot-detect.html",
        "http://www.msftconnecttest.com/connecttest.txt",
      ];
      const urlVal =
        itemModal.itemData.url || "http://cp.cloudflare.com/generate_204";
      if (presets.includes(urlVal)) {
        presetUrlSelectConfig.value = urlVal;
      } else {
        presetUrlSelectConfig.value = "custom";
      }
      itemModal.itemData.url = urlVal;
    }
  }

  itemModal.jsonText = JSON.stringify(itemModal.itemData, null, 2);
  itemModal.show = true;
};
  return { addInbound, editItem };
};
