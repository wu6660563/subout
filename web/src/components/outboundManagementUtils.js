const BASIC_OUTBOUND_TYPES = new Set(["direct", "block", "dns"]);
const GROUP_OUTBOUND_TYPES = new Set(["selector", "urltest"]);

export const isGroupOutbound = (outbound) =>
  GROUP_OUTBOUND_TYPES.has(outbound?.type);

export const isProxyOutbound = (outbound) =>
  Boolean(outbound) &&
  !BASIC_OUTBOUND_TYPES.has(outbound.type) &&
  !GROUP_OUTBOUND_TYPES.has(outbound.type);

export const getOutboundTags = (outbounds) =>
  Array.from(
    new Set(
      (outbounds || [])
        .map((outbound) => outbound?.tag)
        .filter(Boolean),
    ),
  );

export const getOutboundTypeBuckets = (outbounds) => {
  const basic = [];
  const groups = [];
  const proxies = [];

  (outbounds || []).forEach((outbound) => {
    if (BASIC_OUTBOUND_TYPES.has(outbound?.type)) basic.push(outbound);
    else if (isGroupOutbound(outbound)) groups.push(outbound);
    else if (isProxyOutbound(outbound)) proxies.push(outbound);
  });

  return { basic, groups, proxies };
};

export const toggleSelectedTag = (selectedTags, tag, selected) => {
  const current = selectedTags || [];
  if (selected && !current.includes(tag)) return [...current, tag];
  if (!selected) return current.filter((item) => item !== tag);
  return current;
};

export const removeGroupsAndOrphanedProxyNodes = (outbounds, groupTags) => {
  const tagsToRemove = new Set(groupTags || []);
  const allOutbounds = outbounds || [];
  const removedGroups = allOutbounds.filter(
    (outbound) => tagsToRemove.has(outbound.tag) && isGroupOutbound(outbound),
  );
  const candidateNodeTags = new Set(
    removedGroups.flatMap((group) =>
      Array.isArray(group.outbounds) ? group.outbounds : [],
    ),
  );
  const remainingOutbounds = allOutbounds.filter(
    (outbound) =>
      !(tagsToRemove.has(outbound.tag) && isGroupOutbound(outbound)),
  );
  const referencedByRemainingGroups = new Set(
    remainingOutbounds
      .filter(isGroupOutbound)
      .flatMap((group) =>
        Array.isArray(group.outbounds) ? group.outbounds : [],
      ),
  );
  const orphanedProxyTags = new Set(
    remainingOutbounds
      .filter(
        (outbound) =>
          candidateNodeTags.has(outbound.tag) &&
          isProxyOutbound(outbound) &&
          !referencedByRemainingGroups.has(outbound.tag),
      )
      .map((outbound) => outbound.tag),
  );

  return {
    outbounds: remainingOutbounds.filter(
      (outbound) => !orphanedProxyTags.has(outbound.tag),
    ),
    orphanedProxyCount: orphanedProxyTags.size,
  };
};
