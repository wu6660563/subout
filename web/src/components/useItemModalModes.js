export const useItemModalModes = ({
  itemModal,
  isLinux,
  ITEM_ARRAY_FIELDS,
  ITEM_ARRAY_FIELDS_WITHOUT_PORT,
  buildItemTempFields,
  buildLogicalRuleCriteria,
  normalizeStandardRuleFields,
  serializeItemDataForSource,
}) => {
const syncVisualToItemData = () => {
  const arrayFields = ITEM_ARRAY_FIELDS_WITHOUT_PORT;

  if (itemModal.itemType === "dns_rule") {
    if (itemModal.itemData.client_subnet !== undefined) {
      if (typeof itemModal.itemData.client_subnet === "string") {
        itemModal.itemData.client_subnet =
          itemModal.itemData.client_subnet.trim();
      }
      if (!itemModal.itemData.client_subnet) {
        delete itemModal.itemData.client_subnet;
      }
    }
  }

  if (
    ["route_rule", "dns_rule"].includes(itemModal.itemType) &&
    itemModal.routeRuleLogic &&
    itemModal.routeRuleLogic !== "standard"
  ) {
    itemModal.itemData.type = "logical";
    itemModal.itemData.mode = itemModal.routeRuleLogic;

    const rules = buildLogicalRuleCriteria(itemModal.tempFields, arrayFields);
    arrayFields.forEach((f) => delete itemModal.itemData[f]);

    delete itemModal.itemData.port;

    itemModal.itemData.rules = rules;
  } else {
    if (["route_rule", "dns_rule"].includes(itemModal.itemType)) {
      delete itemModal.itemData.type;
      delete itemModal.itemData.mode;
      delete itemModal.itemData.rules;
    }

    const normalized = normalizeStandardRuleFields(
      itemModal.itemData,
      itemModal.tempFields,
      arrayFields,
      itemModal.itemType,
    );
    Object.keys(itemModal.itemData).forEach((key) => delete itemModal.itemData[key]);
    Object.assign(itemModal.itemData, normalized);
  }

  // Type compatibility cleanup
  if (
    itemModal.itemType === "dns_server" &&
    itemModal.itemData.type === "local"
  ) {
    delete itemModal.itemData.server;
    delete itemModal.itemData.detour;
  }
  if (itemModal.itemType === "inbound") {
    if (itemModal.itemData.type === "tun") {
      delete itemModal.itemData.listen;
      delete itemModal.itemData.listen_port;
      if (!isLinux.value) {
        delete itemModal.itemData.auto_redirect;
      }
    } else {
      delete itemModal.itemData.interface_name;
      delete itemModal.itemData.stack;
      delete itemModal.itemData.auto_route;
      delete itemModal.itemData.strict_route;
      delete itemModal.itemData.mtu;
      delete itemModal.itemData.auto_redirect;
    }
  }
  if (itemModal.itemType === "route_ruleset") {
    if (itemModal.itemData.type === "local") {
      delete itemModal.itemData.url;
      delete itemModal.itemData.download_detour;
      delete itemModal.itemData.update_interval;
      delete itemModal.itemData.format;
    } else {
      delete itemModal.itemData.path;
    }
  }
  if (itemModal.itemType === "outbound") {
    if (["direct", "block", "dns"].includes(itemModal.itemData.type)) {
      delete itemModal.itemData.server;
      delete itemModal.itemData.port;
      delete itemModal.itemData.uuid;
      delete itemModal.itemData.password;
      delete itemModal.itemData.method;
      delete itemModal.itemData.outbounds;
      delete itemModal.itemData.url;
      delete itemModal.itemData.interval;
      delete itemModal.itemData.tls;
      delete itemModal.itemData.transport;
      delete itemModal.itemData.up_mbps;
      delete itemModal.itemData.down_mbps;
    } else if (["selector", "urltest"].includes(itemModal.itemData.type)) {
      delete itemModal.itemData.server;
      delete itemModal.itemData.port;
      delete itemModal.itemData.uuid;
      delete itemModal.itemData.password;
      delete itemModal.itemData.method;
      delete itemModal.itemData.tls;
      delete itemModal.itemData.transport;
      delete itemModal.itemData.up_mbps;
      delete itemModal.itemData.down_mbps;
      if (itemModal.itemData.type !== "urltest") {
        delete itemModal.itemData.url;
        delete itemModal.itemData.interval;
      }
    } else {
      delete itemModal.itemData.outbounds;
      delete itemModal.itemData.url;
      delete itemModal.itemData.interval;

      if (itemModal.itemData.port) {
        itemModal.itemData.port = parseInt(itemModal.itemData.port);
        itemModal.itemData.server_port = itemModal.itemData.port;
      }

      if (!["vless", "vmess", "tuic"].includes(itemModal.itemData.type)) {
        delete itemModal.itemData.uuid;
      }
      if (
        !["trojan", "shadowsocks", "hysteria2", "tuic"].includes(
          itemModal.itemData.type,
        )
      ) {
        delete itemModal.itemData.password;
      }
      if (itemModal.itemData.type !== "shadowsocks") {
        delete itemModal.itemData.method;
      }

      if (itemModal.itemData.type === "hysteria2") {
        if (itemModal.itemData.up_mbps) {
          itemModal.itemData.up_mbps = parseInt(itemModal.itemData.up_mbps);
        } else {
          delete itemModal.itemData.up_mbps;
        }
        if (itemModal.itemData.down_mbps) {
          itemModal.itemData.down_mbps = parseInt(itemModal.itemData.down_mbps);
        } else {
          delete itemModal.itemData.down_mbps;
        }
      } else {
        delete itemModal.itemData.up_mbps;
        delete itemModal.itemData.down_mbps;
      }

      if (itemModal.itemData.tls && itemModal.itemData.tls.enabled) {
        if (
          itemModal.itemData.tls.reality &&
          itemModal.itemData.tls.reality.enabled
        ) {
          // keep reality
        } else {
          delete itemModal.itemData.tls.reality;
        }
      } else {
        delete itemModal.itemData.tls;
      }

      if (itemModal.itemData.transport && itemModal.itemData.transport.type) {
        if (["ws", "http"].includes(itemModal.itemData.transport.type)) {
          delete itemModal.itemData.transport.service_name;
        } else if (itemModal.itemData.transport.type === "grpc") {
          delete itemModal.itemData.transport.path;
        }
      } else {
        delete itemModal.itemData.transport;
      }
    }
  }
};

const setItemModalMode = (mode) => {
  if (itemModal.mode === mode) return;

  if (mode === "visual") {
    try {
      const parsed = JSON.parse(itemModal.jsonText);
      if (itemModal.itemType === "outbound") {
        if (parsed.server_port !== undefined && parsed.port === undefined) {
          parsed.port = parsed.server_port;
        }
        if (!parsed.tls) {
          parsed.tls = { enabled: false, server_name: "", insecure: false };
        }
        if (!parsed.tls.reality) {
          parsed.tls.reality = { enabled: false, public_key: "", short_id: "" };
        }
        if (!parsed.transport) {
          parsed.transport = { type: "", path: "", service_name: "" };
        }
      }
      if (itemModal.itemType === "dns_rule") {
        if (parsed.type === "logical") {
          itemModal.routeRuleLogic = parsed.mode || "or";
        } else {
          itemModal.routeRuleLogic = "standard";
        }
      }
      itemModal.itemData = parsed;

      const arrayFields = ITEM_ARRAY_FIELDS;
      Object.assign(
        itemModal.tempFields,
        buildItemTempFields(parsed, arrayFields),
      );
      itemModal.mode = mode;
      itemModal.error = "";
    } catch (e) {
      itemModal.error = `JSON 语法解析错误: ${e.message}。请在源码模式下修复再切换。`;
    }
  } else {
    syncVisualToItemData();
    const cloned = serializeItemDataForSource(
      itemModal.itemData,
      itemModal.itemType,
    );
    itemModal.jsonText = JSON.stringify(cloned, null, 2);
    itemModal.mode = mode;
  }
};

  return { syncVisualToItemData, setItemModalMode };
};
