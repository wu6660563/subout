export const normalizeImportedOutbounds = (json, sanitizeOutbound) => {
  const list = Array.isArray(json) ? JSON.parse(JSON.stringify(json)) : [];
  list.forEach((outbound, index) => {
    if (outbound.server_port !== undefined && outbound.port === undefined) {
      outbound.port = outbound.server_port;
    }
    list[index] = sanitizeOutbound(outbound);
  });
  return list;
};
