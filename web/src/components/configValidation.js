const findDuplicateTags = (list) => {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const duplicates = new Set();

  for (const item of list) {
    if (item && typeof item === "object" && item.tag) {
      if (seen.has(item.tag)) {
        duplicates.add(item.tag);
      } else {
        seen.add(item.tag);
      }
    }
  }

  return Array.from(duplicates);
};

const invalid = (message) => ({ valid: false, message });

const hostPart = (value) => String(value || "").trim().split("/")[0];

const ipv4Number = (value) => {
  const parts = String(value).split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part) || Number(part) > 255)) return null;
  return (((Number(parts[0]) << 24) >>> 0) + (Number(parts[1]) << 16) + (Number(parts[2]) << 8) + Number(parts[3])) >>> 0;
};

const ipv6Number = (value) => {
  const address = hostPart(value).split("%")[0].toLowerCase();
  if (!address.includes(":")) return null;
  const sections = address.split("::");
  if (sections.length > 2) return null;
  const left = sections[0] ? sections[0].split(":") : [];
  const right = sections.length === 2 && sections[1] ? sections[1].split(":") : [];
  if ([...left, ...right].some((section) => !/^[0-9a-f]{1,4}$/.test(section))) return null;
  const missing = sections.length === 2 ? 8 - left.length - right.length : 0;
  if (missing < (sections.length === 2 ? 1 : 0) || left.length + right.length + missing !== 8) return null;
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  return BigInt(`0x${groups.join("")}`);
};

const containsIpv6Host = (cidr, host) => {
  const [network, prefixText] = String(cidr).split("/");
  const prefix = Number(prefixText);
  const networkValue = ipv6Number(network);
  const hostValue = ipv6Number(host);
  if (networkValue === null || hostValue === null || prefix < 0 || prefix > 128) return false;
  const mask = prefix === 0 ? 0n : ((1n << 128n) - 1n) ^ ((1n << BigInt(128 - prefix)) - 1n);
  return (networkValue & mask) === (hostValue & mask);
};

const containsHost = (cidr, host) => {
  if (hostPart(cidr) === hostPart(host)) return true;
  if (String(cidr).includes(":")) return containsIpv6Host(cidr, host);
  const [network, prefixText] = String(cidr).split("/");
  const prefix = Number(prefixText);
  const networkValue = ipv4Number(network);
  const hostValue = ipv4Number(hostPart(host));
  if (networkValue === null || hostValue === null || prefix < 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (networkValue & mask) === (hostValue & mask);
};

const ipv4Text = (value) => [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(".");

const formatCidrRange = (cidr) => {
  const [network, prefixText] = String(cidr).split("/");
  const prefix = Number(prefixText);
  const networkValue = ipv4Number(network);
  if (networkValue === null || prefix < 0 || prefix > 32) return String(cidr);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const first = (networkValue & mask) >>> 0;
  const last = (first | (~mask >>> 0)) >>> 0;
  return `${ipv4Text(first)}～${ipv4Text(last)}`;
};

export const validateFullConfigData = (fullData, validateSection) => {
  for (const section of Object.keys(fullData)) {
    const result = validateSection(section, fullData[section]);
    if (!result.valid) {
      return invalid(
        `[${section}] 配置校验失败: ${result.errors}`,
      );
    }
  }

  if (Array.isArray(fullData.outbounds)) {
    const duplicateOutbounds = findDuplicateTags(fullData.outbounds);
    if (duplicateOutbounds.length > 0) {
      return invalid(
        `[outbounds] 配置校验失败: 出站连接中存在重复的 tag: "${duplicateOutbounds.join('", "')}"，请修改或删除重复项。`,
      );
    }

    const groupTypes = [
      "selector",
      "urltest",
      "url-test",
      "fallback",
      "loadbalance",
    ];
    for (let index = 0; index < fullData.outbounds.length; index++) {
      const outbound = fullData.outbounds[index];
      if (
        outbound &&
        groupTypes.includes(outbound.type) &&
        (!Array.isArray(outbound.outbounds) || outbound.outbounds.length === 0)
      ) {
        return invalid(
          `[outbounds] 配置校验失败: 第 ${index + 1} 项出站 "${outbound.tag || "未命名"}" (${outbound.type}) 未配置任何目标节点/出站 (outbounds 列表为空)，请在编辑界面为其添加至少一个目标出站。`,
        );
      }
    }
  }

  if (Array.isArray(fullData.inbounds)) {
    const duplicateInbounds = findDuplicateTags(fullData.inbounds);
    if (duplicateInbounds.length > 0) {
      return invalid(
        `[inbounds] 配置校验失败: 入站连接中存在重复的 tag: "${duplicateInbounds.join('", "')}"`,
      );
    }

    for (const inbound of fullData.inbounds) {
      if (inbound?.type !== "tun") continue;
      const protectedHosts = new Set(
        [...(inbound.address || []), ...(inbound.dns_address || [])].map(hostPart),
      );
      const bypasses = Array.isArray(inbound.route_exclude_address)
        ? inbound.route_exclude_address
        : [];
      const selfBypass = bypasses.find((address) => [...protectedHosts].some((host) => containsHost(address, host)));
      if (selfBypass) {
        return invalid(
          `[inbounds] 配置校验失败: TUN 入站 "${inbound.tag || "未命名"}" 的绕过地址 ${selfBypass} 覆盖 TUN 地址或 TUN DNS 地址（实际范围：${formatCidrRange(selfBypass)}），请改用不包含 TUN 网段的精确 CIDR。`,
        );
      }
    }
  }

  return { valid: true, message: "" };
};
