const TLS_SUPPORTED_TYPES = [
  "http",
  "vmess",
  "vless",
  "trojan",
  "anytls",
  "hysteria",
  "hysteria2",
  "shadowtls",
  "tuic",
  "v2ray",
];

const OUTBOUND_TYPE_LABELS = {
  direct: "直连 (Direct)",
  block: "阻断 (Block)",
  dns: "DNS 出站 (DNS)",
  selector: "选择器 (Selector)",
  urltest: "自动测速 (URLTest)",
};

const PROXY_TYPE_LABELS = {
  trojan: "Trojan 代理",
  vless: "VLESS 代理",
  vmess: "VMess 代理",
  shadowsocks: "Shadowsocks",
  wireguard: "WireGuard",
  hysteria2: "Hysteria 2",
  tuic: "TUIC",
};

const PROTOCOL_BADGE_CLASSES = {
  trojan: "badge-success",
  vless: "badge-info",
  vmess: "badge-primary",
  shadowsocks: "badge-warning",
  wireguard: "badge-secondary",
  hysteria2: "badge-danger",
  tuic: "badge-info",
};

export const getOutboundTypeDisplay = (type) =>
  OUTBOUND_TYPE_LABELS[type] || type;

export const getProxyTypeDisplay = (type) => PROXY_TYPE_LABELS[type] || type;

export const getProtocolBadgeClass = (type) =>
  PROTOCOL_BADGE_CLASSES[type] || "badge";

export const sanitizeOutboundItem = (outbound) => {
  if (!outbound || typeof outbound !== "object") return outbound;
  const item = { ...outbound };
  if (item.type && !TLS_SUPPORTED_TYPES.includes(item.type)) {
    delete item.tls;
  }
  return item;
};
