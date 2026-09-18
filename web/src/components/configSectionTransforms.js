// Parsers
export const parseLog = (target, json) => {
  target.log.disabled = !!json.disabled;
  target.log.level = json.level || "info";
  target.log.timestamp = json.timestamp !== false;
  target.log.output = json.output || "";
  target.log._extra = { ...json };
  delete target.log._extra.disabled;
  delete target.log._extra.level;
  delete target.log._extra.timestamp;
  delete target.log._extra.output;
};

export const parseDns = (target, json) => {
  target.dns.strategy = json.strategy || "ipv4_only";
  target.dns.final = json.final || "";
  target.dns.independent_cache = json.independent_cache !== false;
  target.dns.disable_cache = !!json.disable_cache;
  target.dns.disable_expire = !!json.disable_expire;
  target.dns.reverse_mapping = !!json.reverse_mapping;
  target.dns.client_subnet = json.client_subnet || "";

  let rawServers = [];
  if (json) {
    if (Array.isArray(json.servers)) {
      rawServers = json.servers;
    } else if (Array.isArray(json)) {
      rawServers = json;
    } else if (json.dns && Array.isArray(json.dns.servers)) {
      rawServers = json.dns.servers;
    }
  }

  target.dns.servers = JSON.parse(JSON.stringify(rawServers)).map((srv) => {
    if (srv && typeof srv === "object") {
      if (srv.address !== undefined && srv.server === undefined) {
        srv.server = srv.address;
        delete srv.address;
      }
      if (srv.type && typeof srv.type === "string") {
        const typeLower = srv.type.toLowerCase();
        if (typeLower === "dns") {
          srv.type = "udp";
        } else if (typeLower === "doh" || typeLower === "http3") {
          srv.type = "https";
        } else if (typeLower === "dot") {
          srv.type = "tls";
        } else if (typeLower === "doq") {
          srv.type = "quic";
        }
      }
    }
    return srv;
  });

  target.dns.rules =
    json && Array.isArray(json.rules)
      ? JSON.parse(JSON.stringify(json.rules))
      : [];
  if (json.fakeip) {
    target.dns.fakeip.enabled = true;
    target.dns.fakeip.inet4_range = json.fakeip.inet4_range || "";
    target.dns.fakeip.inet6_range = json.fakeip.inet6_range || "";
  } else {
    target.dns.fakeip.enabled = false;
    target.dns.fakeip.inet4_range = "";
    target.dns.fakeip.inet6_range = "";
  }
  target.dns._extra = { ...json };
  delete target.dns._extra.strategy;
  delete target.dns._extra.final;
  delete target.dns._extra.independent_cache;
  delete target.dns._extra.disable_cache;
  delete target.dns._extra.disable_expire;
  delete target.dns._extra.reverse_mapping;
  delete target.dns._extra.servers;
  delete target.dns._extra.rules;
  delete target.dns._extra.fakeip;
  delete target.dns._extra.client_subnet;
};

export const parseInbounds = (target, json, notifyOnRemove = false, isLinux, notify = () => {}) => {
  const list = Array.isArray(json) ? JSON.parse(JSON.stringify(json)) : [];

  if (!isLinux && Array.isArray(list)) {
    let hasAutoRedirect = false;
    list.forEach((inb) => {
      if (
        inb &&
        typeof inb === "object" &&
        ("auto_redirect" in inb || inb.auto_redirect !== undefined)
      ) {
        delete inb.auto_redirect;
        hasAutoRedirect = true;
      }
    });
    if (hasAutoRedirect && notifyOnRemove) {
      notify(
        "检测到配置包含「自动重定向 (auto_redirect)」，当前系统非 Linux，该配置将被忽略并已自动删除。",
        "warning",
      );
    }
  }

  target.inbounds = list;
};

export const parseRoute = (target, json) => {
  target.route.final = json.final || "direct";
  target.route.auto_detect_interface = json.auto_detect_interface !== false;
  target.route.default_domain_resolver = json.default_domain_resolver || "";
  target.route.rules = Array.isArray(json.rules)
    ? JSON.parse(JSON.stringify(json.rules))
    : [];
  target.route.rule_set = Array.isArray(json.rule_set)
    ? JSON.parse(JSON.stringify(json.rule_set))
    : [];
  target.route._extra = { ...json };
  delete target.route._extra.final;
  delete target.route._extra.auto_detect_interface;
  delete target.route._extra.default_domain_resolver;
  delete target.route._extra.rules;
  delete target.route._extra.rule_set;
};

export const parseExperimental = (target, json) => {
  if (json.cache_file) {
    target.experimental.cache_file.enabled = true;
    target.experimental.cache_file.path = json.cache_file.path || "";
    target.experimental.cache_file.store_fakeip =
      json.cache_file.store_fakeip !== false;
    target.experimental.cache_file.store_rdrc =
      json.cache_file.store_rdrc !== false;
  } else {
    target.experimental.cache_file.enabled = false;
    target.experimental.cache_file.path = "";
    target.experimental.cache_file.store_fakeip = false;
    target.experimental.cache_file.store_rdrc = false;
  }
  const clashApiEnabled =
    json.clash_api &&
    typeof json.clash_api === "object" &&
    Object.keys(json.clash_api).length > 0;
  if (clashApiEnabled) {
    target.experimental.clash_api.enabled = true;
    target.experimental.clash_api.external_controller =
      json.clash_api.external_controller || "";
    target.experimental.clash_api.external_ui =
      json.clash_api.external_ui || "";
    target.experimental.clash_api.secret = json.clash_api.secret || "";
    const defaultMode = json.clash_api.default_mode || "Rule";
    const normalizedMode = String(defaultMode).toLowerCase();
    target.experimental.clash_api.default_mode =
      normalizedMode === "global"
        ? "Global"
        : normalizedMode === "direct"
          ? "Direct"
          : "Rule";
  } else {
    target.experimental.clash_api.enabled = false;
    target.experimental.clash_api.external_controller = "";
    target.experimental.clash_api.external_ui = "";
    target.experimental.clash_api.secret = "";
    target.experimental.clash_api.default_mode = "Rule";
  }
  target.experimental._extra = { ...json };
  delete target.experimental._extra.cache_file;
  delete target.experimental._extra.clash_api;
};

// Serializers
export const serializeLog = (data) => {
  const obj = {
    disabled: data.log.disabled,
    level: data.log.level,
    timestamp: data.log.timestamp,
    ...(data.log._extra || {}),
  };
  if (data.log.output) {
    obj.output = data.log.output;
  }
  return obj;
};

export const serializeDns = (data) => {
  const servers = JSON.parse(JSON.stringify(data.dns.servers));
  servers.forEach((srv) => {
    if (!srv.detour) {
      delete srv.detour;
    }
  });
  const obj = {
    strategy: data.dns.strategy,
    final: data.dns.final,
    independent_cache: data.dns.independent_cache,
    disable_cache: data.dns.disable_cache,
    disable_expire: data.dns.disable_expire,
    reverse_mapping: data.dns.reverse_mapping,
    servers: servers,
    rules: JSON.parse(JSON.stringify(data.dns.rules)),
    ...(data.dns._extra || {}),
  };
  if (data.dns.client_subnet) {
    obj.client_subnet = data.dns.client_subnet.trim();
  }
  if (data.dns.fakeip.enabled) {
    obj.fakeip = {
      inet4_range: data.dns.fakeip.inet4_range,
      inet6_range: data.dns.fakeip.inet6_range,
    };
  }
  return obj;
};

export const serializeInbounds = (data, isLinux) => {
  const list = JSON.parse(JSON.stringify(data.inbounds));
  if (!isLinux && Array.isArray(list)) {
    list.forEach((inb) => {
      if (inb && typeof inb === "object") {
        delete inb.auto_redirect;
      }
    });
  }
  return list;
};

export const serializeOutbounds = (data, sanitizeOutboundItem) => {
  const list = JSON.parse(JSON.stringify(data.outbounds || []));
  return list.map((outb) => {
    const item = sanitizeOutboundItem(outb);
    if (item.port !== undefined) {
      item.server_port = parseInt(item.port);
      delete item.port;
    }
    return item;
  });
};

export const serializeRoute = (data) => {
  const obj = {
    final: data.route.final,
    auto_detect_interface: data.route.auto_detect_interface,
    default_domain_resolver:
      data.route.default_domain_resolver || undefined,
    rules: JSON.parse(JSON.stringify(data.route.rules)),
    rule_set: JSON.parse(JSON.stringify(data.route.rule_set)),
    ...(data.route._extra || {}),
  };
  return obj;
};

export const serializeExperimental = (data) => {
  const obj = {
    ...(data.experimental._extra || {}),
  };
  if (data.experimental.cache_file.enabled) {
    obj.cache_file = {
      enabled: true,
      store_fakeip: data.experimental.cache_file.store_fakeip,
      store_rdrc: data.experimental.cache_file.store_rdrc,
    };
    if (data.experimental.cache_file.path) {
      obj.cache_file.path = data.experimental.cache_file.path;
    }
  }
  if (data.experimental.clash_api.enabled) {
    obj.clash_api = {
      external_controller:
        data.experimental.clash_api.external_controller,
      external_ui: data.experimental.clash_api.external_ui || undefined,
      secret: data.experimental.clash_api.secret || undefined,
      default_mode: data.experimental.clash_api.default_mode || undefined,
    };
  } else {
    // Keep an explicit disabled marker so the runtime can degrade audit node
    // resolution instead of re-enabling a local Clash API.
    obj.clash_api = {};
  }
  return obj;
};
