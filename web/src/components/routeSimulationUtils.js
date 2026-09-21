const matchesStringList = (values, value, matcher) =>
  !Array.isArray(values) || values.length === 0 || values.some((item) => matcher(String(item).toLowerCase(), value));

const ipv4Number = (value) => {
  const parts = String(value).split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part) || Number(part) > 255)) return null;
  return (((Number(parts[0]) << 24) >>> 0) + (Number(parts[1]) << 16) + (Number(parts[2]) << 8) + Number(parts[3])) >>> 0;
};

const ipv6Number = (value) => {
  const address = String(value).split("/")[0].split("%")[0].toLowerCase();
  if (!address.includes(":")) return null;
  const sections = address.split("::");
  if (sections.length > 2) return null;
  const left = sections[0] ? sections[0].split(":") : [];
  const right = sections.length === 2 && sections[1] ? sections[1].split(":") : [];
  if ([...left, ...right].some((section) => !/^[0-9a-f]{1,4}$/.test(section))) return null;
  const missing = sections.length === 2 ? 8 - left.length - right.length : 0;
  if (missing < (sections.length === 2 ? 1 : 0) || left.length + right.length + missing !== 8) return null;
  return BigInt(`0x${[...left, ...Array.from({ length: missing }, () => "0"), ...right].join("")}`);
};

const matchesCidr = (cidr, ip) => {
  const [network, prefixValue] = String(cidr).split("/");
  const prefix = Number(prefixValue);
  if (String(cidr).includes(":")) {
    const left = ipv6Number(network);
    const right = ipv6Number(ip);
    if (left === null || right === null || prefix < 0 || prefix > 128) return false;
    const mask = prefix === 0 ? 0n : ((1n << 128n) - 1n) ^ ((1n << BigInt(128 - prefix)) - 1n);
    return (left & mask) === (right & mask);
  }
  const left = ipv4Number(network);
  const right = ipv4Number(ip);
  if (left === null || right === null || prefix < 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (left & mask) === (right & mask);
};

const isPrivateIpv4 = (ip) => ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"].some((cidr) => matchesCidr(cidr, ip));
const isPrivateIp = (ip) => isPrivateIpv4(ip) || ["fc00::/7", "fe80::/10"].some((cidr) => matchesCidr(cidr, ip));
const effectiveIp = (target) => String(target.resolvedIp || target.domain || "").trim();
const matchesPortRange = (range, port) => {
  const [startText, endText] = String(range).split(":");
  const start = startText ? Number(startText) : 0;
  const end = endText ? Number(endText) : 65535;
  return Number(port) >= start && Number(port) <= end;
};

const matchesRule = (rule, target) => {
  const domain = String(target.domain || "").toLowerCase();
  const processName = String(target.processName || "").toLowerCase();
  const processPath = String(target.processPath || "").toLowerCase();
  const ip = effectiveIp(target);
  const ipVersion = ip.includes(":") ? 6 : ipv4Number(ip) !== null ? 4 : null;
  const network = String(target.network || "").toLowerCase();
  const port = Number(target.port);
  if (!matchesStringList(rule.domain, domain, (item, value) => item === value)) return false;
  if (!matchesStringList(rule.domain_suffix, domain, (item, value) => value === item || value.endsWith(`.${item.replace(/^\./, "")}`))) return false;
  if (!matchesStringList(rule.domain_keyword, domain, (item, value) => value.includes(item))) return false;
  if (!matchesStringList(rule.domain_regex, domain, (item, value) => {
    try { return new RegExp(item, "i").test(value); } catch { return false; }
  })) return false;
  if (!matchesStringList(rule.process_name, processName, (item, value) => item === value)) return false;
  if (!matchesStringList(rule.process_path, processPath, (item, value) => item === value)) return false;
  if (!matchesStringList(rule.process_path_regex, processPath, (item, value) => {
    try { return new RegExp(item, "i").test(value); } catch { return false; }
  })) return false;
  if (rule.ip_version != null && Number(rule.ip_version) !== ipVersion) return false;
  if (Array.isArray(rule.ip_cidr) && rule.ip_cidr.length && !rule.ip_cidr.some((cidr) => matchesCidr(cidr, ip))) return false;
  if (!matchesStringList(rule.network, network, (item, value) => item === value)) return false;
  if (Array.isArray(rule.port) && rule.port.length && !rule.port.map(Number).includes(port)) return false;
  if (Array.isArray(rule.port_range) && rule.port_range.length && !rule.port_range.some((range) => matchesPortRange(range, port))) return false;
  return rule.ip_is_private === undefined || Boolean(rule.ip_is_private) === isPrivateIp(ip);
};

const matchesLogicalRule = (rule, target) => {
  if (rule?.type !== "logical") return matchesRule(rule, target);
  const children = Array.isArray(rule.rules) ? rule.rules : [];
  return rule.mode === "or"
    ? children.some((child) => matchesLogicalRule(child, target))
    : children.every((child) => matchesLogicalRule(child, target));
};

const mismatchReasons = (rule, target) => {
  if (rule?.type === "logical") return ["逻辑子规则未全部匹配"];
  const domain = String(target.domain || "").toLowerCase();
  const reasons = [];
  if (Array.isArray(rule.domain) && rule.domain.length && !rule.domain.map((item) => String(item).toLowerCase()).includes(domain)) reasons.push("域名不匹配");
  if (Array.isArray(rule.domain_suffix) && rule.domain_suffix.length && !rule.domain_suffix.some((item) => domain === String(item).toLowerCase() || domain.endsWith(`.${String(item).replace(/^\./, "").toLowerCase()}`))) reasons.push("域名后缀不匹配");
  if (Array.isArray(rule.domain_keyword) && rule.domain_keyword.length && !rule.domain_keyword.some((item) => domain.includes(String(item).toLowerCase()))) reasons.push("域名关键词不匹配");
  if (Array.isArray(rule.port) && rule.port.length && !rule.port.map(Number).includes(Number(target.port))) reasons.push("端口不匹配");
  if (Array.isArray(rule.network) && rule.network.length && !rule.network.map((item) => String(item).toLowerCase()).includes(String(target.network).toLowerCase())) reasons.push("协议不匹配");
  if (Array.isArray(rule.process_name) && rule.process_name.length && !rule.process_name.map((item) => String(item).toLowerCase()).includes(String(target.processName || "").toLowerCase())) reasons.push("进程名不匹配");
  return reasons.length ? reasons : ["静态模拟无法判断此规则条件"];
};

export const simulateRoute = (target, config) => {
  const route = config?.route || {};
  const rules = Array.isArray(route.rules) ? route.rules : [];
  const index = rules.findIndex((rule) => rule && matchesLogicalRule(rule, target));
  const matchedRule = index >= 0 ? rules[index] : null;
  const outbound = matchedRule?.outbound || route.final || "direct";
  const direct = outbound === "direct";
  return {
    matchedRuleIndex: index >= 0 ? index : null,
    outbound,
    routeKind: direct ? "DIRECT" : "PROXY",
    directNotice: direct
      ? "命中 Direct：不经过代理节点；若流量已被 TUN 接管，连接仍由 sing-box.exe 发起，不能恢复为浏览器或 SDC 沙箱原进程。"
      : "命中代理出站：连接将经选定的代理节点发起。",
    limitations: Array.isArray(matchedRule?.rule_set) && matchedRule.rule_set.length
      ? "当前规则包含 rule_set；静态模拟无法读取其实际内容，请以 sing-box 运行结果为准。"
      : "",
    skippedRules: rules
      .slice(0, index >= 0 ? index : rules.length)
      .map((rule, skippedIndex) => ({ index: skippedIndex, reasons: mismatchReasons(rule, target) })),
  };
};

export const simulateTunCapture = (target, config) => {
  const tun = (Array.isArray(config?.inbounds) ? config.inbounds : []).find((inbound) => inbound?.type === "tun");
  if (!tun) return { status: "NO_TUN", message: "当前生成配置未包含 TUN 入站。" };

  const targetIp = effectiveIp(target);
  if (ipv4Number(targetIp) === null && ipv6Number(targetIp) === null) {
    return { status: "NEEDS_RESOLUTION", message: "域名需先解析为 IP，才能判断是否命中 TUN 接管或绕过网段。" };
  }

  const bypass = (Array.isArray(tun.route_exclude_address) ? tun.route_exclude_address : [])
    .find((cidr) => matchesCidr(cidr, targetIp));
  if (bypass) {
    return { status: "BYPASSED", message: `目标 IP 命中绕过地址 ${bypass}，不会进入 TUN；SDC 可看到原始浏览器/沙箱进程。` };
  }

  const captured = (Array.isArray(tun.route_address) ? tun.route_address : [])
    .find((cidr) => matchesCidr(cidr, targetIp));
  if (captured) {
    return { status: "CAPTURED", message: `目标 IP 命中接管地址 ${captured}，会进入 TUN，由 sing-box.exe 发起连接。` };
  }
  if (tun.auto_route !== false) {
    return { status: "LIKELY_CAPTURED", message: "未命中显式绕过地址；auto_route 已开启，是否进入 TUN 取决于系统下发路由，请以运行日志为准。" };
  }
  return { status: "UNKNOWN", message: "自动路由已关闭且未命中接管地址，无法从当前配置判断是否进入 TUN。" };
};

export const simulateDnsRoute = (domain, config) => {
  const dns = config?.dns || {};
  const rules = Array.isArray(dns.rules) ? dns.rules : [];
  const index = rules.findIndex((rule) => rule && matchesRule(rule, { domain, network: "udp", port: 53 }));
  return { matchedRuleIndex: index >= 0 ? index : null, server: index >= 0 ? rules[index].server || dns.final || "" : dns.final || "" };
};
