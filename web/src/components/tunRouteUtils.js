const PRIVATE_NETWORKS = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "100.64.0.0/10",
  "169.254.0.0/16",
];

const normalizeList = (value) =>
  (Array.isArray(value) ? value : [])
    .map((item) => String(item).trim())
    .filter(Boolean);

const parseIpv4 = (value) => {
  const octets = String(value).split("/")[0].split(".");
  if (octets.length !== 4 || octets.some((octet) => !/^\d+$/.test(octet))) {
    return null;
  }
  const numbers = octets.map(Number);
  if (numbers.some((octet) => octet > 255)) return null;
  return (((numbers[0] << 24) >>> 0) + (numbers[1] << 16) + (numbers[2] << 8) + numbers[3]) >>> 0;
};

const containsIpv4 = (cidr, address) => {
  const [network, prefixText] = cidr.split("/");
  const prefix = Number(prefixText);
  const networkValue = parseIpv4(network);
  const addressValue = parseIpv4(address);
  if (networkValue === null || addressValue === null || prefix < 0 || prefix > 32) {
    return false;
  }
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (networkValue & mask) === (addressValue & mask);
};

export const addSafePrivateBypassAddresses = (existing, tunInbound) => {
  const current = normalizeList(existing);
  const protectedAddresses = [
    ...normalizeList(tunInbound?.address),
    ...normalizeList(tunInbound?.dns_address),
  ];
  const safePresets = PRIVATE_NETWORKS.filter(
    (cidr) => !protectedAddresses.some((address) => containsIpv4(cidr, address)),
  );

  return [...current, ...safePresets.filter((cidr) => !current.includes(cidr))];
};
