const normalizeAddressList = (value) => {
  const addresses = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,]/)
      : [];

  return addresses.map((address) => String(address).trim()).filter(Boolean);
};

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
    for (const field of [
      "route_address",
      "route_exclude_address",
      "dns_address",
    ]) {
      const addressesForField = normalizeAddressList(normalized[field]);
      if (addressesForField.length > 0) {
        normalized[field] = addressesForField;
      } else {
        delete normalized[field];
      }
    }
    if (!normalized.dns_mode) delete normalized.dns_mode;
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
    delete normalized.route_address;
    delete normalized.route_exclude_address;
    delete normalized.dns_mode;
    delete normalized.dns_address;
  }

  return normalized;
};
