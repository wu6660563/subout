export const CONFIG_SECTION_ORDER = [
  "log",
  "dns",
  "inbounds",
  "outbounds",
  "route",
  "experimental",
];

export const orderConfigSections = (
  data,
  order = CONFIG_SECTION_ORDER,
) => {
  const ordered = {};
  order.forEach((key) => {
    if (data[key] !== undefined) ordered[key] = data[key];
  });
  Object.keys(data).forEach((key) => {
    if (!order.includes(key)) ordered[key] = data[key];
  });
  return ordered;
};
