export const getAddressExample = (type) => {
  switch (type) {
    case "udp":
    case "tcp":
      return "223.5.5.5";
    case "https":
      return "https://223.5.5.5/dns-query";
    case "tls":
      return "223.5.5.5";
    case "quic":
      return "quic://dns.adguard-dns.com";
    default:
      return "";
  }
};

export const getAddressPlaceholder = (type) => {
  switch (type) {
    case "udp":
    case "tcp":
      return "例如: 223.5.5.5";
    case "https":
      return "例如: https://223.5.5.5/dns-query";
    case "tls":
      return "例如: 223.5.5.5 或 dns.google";
    case "quic":
      return "例如: quic://dns.adguard-dns.com";
    case "local":
      return "本地连接，无需配置地址";
    case "fakeip":
      return "FakeIP 模式，无需地址";
    default:
      return "请输入服务器地址";
  }
};

export const normalizeDnsServerForType = (server) => {
  const normalized = JSON.parse(JSON.stringify(server));

  if (normalized.type === "local") {
    delete normalized.server;
    delete normalized.detour;
    delete normalized.inet4_range;
    delete normalized.inet6_range;
  } else if (normalized.type === "fakeip") {
    delete normalized.server;
    delete normalized.detour;
    normalized.inet4_range = normalized.inet4_range || "198.18.0.0/15";
    normalized.inet6_range = normalized.inet6_range || "fc00::/18";
  } else {
    normalized.server = getAddressExample(normalized.type);
    delete normalized.inet4_range;
    delete normalized.inet6_range;
  }

  return normalized;
};
