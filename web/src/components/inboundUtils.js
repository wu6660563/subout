export const normalizeInboundForType = (
  inbound,
  { isLinux, isApplePlatform, isWindowsPlatform } = {},
) => {
  const normalized = JSON.parse(JSON.stringify(inbound));

  if (normalized.type === "tun") {
    const addresses = Array.isArray(normalized.address)
      ? normalized.address.filter((address) => String(address).trim())
      : [];
    if (!addresses.some((address) => address.includes("."))) {
      addresses.unshift("172.19.0.1/30");
    }
    if (!addresses.some((address) => address.includes(":"))) {
      addresses.push("fd00::1/126");
    }
    normalized.address = addresses;
    if (isApplePlatform || isWindowsPlatform) {
      normalized.interface_name = "";
    } else {
      normalized.interface_name = normalized.interface_name || "tun0";
    }
    normalized.stack = normalized.stack || "gvisor";
    normalized.auto_route = normalized.auto_route !== false;
    delete normalized.listen;
    delete normalized.listen_port;
    if (!isLinux) delete normalized.auto_redirect;
  } else {
    normalized.listen = normalized.listen || "::";
    normalized.listen_port = normalized.listen_port || 2334;
    delete normalized.interface_name;
    delete normalized.stack;
    delete normalized.auto_route;
    delete normalized.strict_route;
    delete normalized.mtu;
    delete normalized.auto_redirect;
  }

  return normalized;
};
