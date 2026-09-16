const normalizeDnsServers = (servers) => (servers || []).map((server) => {
  if (!server || typeof server !== "object") return server;
  const next = { ...server };
  if (next.address !== undefined && next.server === undefined) { next.server = next.address; delete next.address; }
  const types = { dns: "udp", doh: "https", http3: "https", dot: "tls", doq: "quic" };
  if (typeof next.type === "string") next.type = types[next.type.toLowerCase()] || next.type;
  return next;
});

export const prepareImportedConfig = (parsed, { isLinux, isApplePlatform }) => {
  if (!parsed || typeof parsed !== "object") throw new Error("配置内容必须是一个 JSON 对象");
  let dns = parsed.dns || (Array.isArray(parsed.servers) ? { servers: parsed.servers } : {});
  dns = { ...dns, servers: normalizeDnsServers(dns.servers) };
  const inbounds = (parsed.inbounds || []).map((inbound) => ({ ...inbound }));
  const notices = { removedAutoRedirect: false, resetInterfaceName: false };
  if (!isLinux) inbounds.forEach((inbound) => {
    if (inbound.auto_redirect !== undefined) { delete inbound.auto_redirect; notices.removedAutoRedirect = true; }
    if (inbound.type === "tun" && (inbound.interface_name === "tun0" || (isApplePlatform && inbound.interface_name && !inbound.interface_name.startsWith("utun")))) { inbound.interface_name = ""; notices.resetInterfaceName = true; }
  });
  return { sections: { log: parsed.log || {}, dns, inbounds, outbounds: parsed.outbounds || [], route: parsed.route || {}, experimental: parsed.experimental || {} }, notices };
};
