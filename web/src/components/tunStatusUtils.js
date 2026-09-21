const hasValues = (value) => Array.isArray(value) && value.some((item) => String(item).trim());

export const getTunRiskWarnings = (tunInbound) => {
  if (!tunInbound || typeof tunInbound !== "object") return [];
  const warnings = [];

  if (tunInbound.auto_route !== false && !hasValues(tunInbound.route_exclude_address)) {
    warnings.push("未配置绕过地址：被 TUN 接管的内网流量仍由 sing-box.exe 发起。若 SDC 依赖原进程身份放行，请将实际内网 CIDR 加入“绕过地址”。");
  }
  if (tunInbound.dns_mode === "hijack" && !hasValues(tunInbound.dns_address)) {
    warnings.push("DNS 接管已开启但未配置 TUN DNS 地址：DNS 将完全依赖 sing-box 的 DNS 规则，请确认企业域名能命中正确的 DNS 服务器。");
  }
  if (tunInbound.auto_route === false) {
    warnings.push("自动路由已关闭：请确认已由系统或外部工具下发了到 TUN 的路由，否则流量可能不会进入 sing-box。");
  }

  return warnings;
};
