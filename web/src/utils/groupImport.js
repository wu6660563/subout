/**
 * 按搜索词过滤分流出站组列表。
 *
 * 匹配规则：组 tag 包含搜索词（大小写不敏感）。空/空白搜索词返回全部组。
 *
 * @param {Array<{tag?: string, [k: string]: any}>} groups - DB 出站组列表
 * @param {string} query - 搜索词（会被 trim + lowercase）
 * @returns {Array} 过滤后的组列表（同引用，不做拷贝）
 */
export function filterGroupsByQuery(groups, query) {
  const normalized = (query || "").toLowerCase().trim();
  const list = groups || [];
  if (!normalized) return list;
  return list.filter((g) => (g?.tag || "").toLowerCase().includes(normalized));
}

/**
 * 判断某个 tag 是否已作为策略组存在于当前配置的出站列表中。
 *
 * @param {Array<{tag: string, type: string}>} outbounds - 配置中的出站列表
 * @param {string} tag - 待检查的组 tag
 * @returns {boolean}
 */
export function isGroupImported(outbounds, tag) {
  return (outbounds || []).some(
    (o) => o.tag === tag && ["selector", "urltest"].includes(o.type),
  );
}

/**
 * 返回尚未出现在当前配置中的 DB 出站组。
 */
export function getAvailableGroups(groups, outbounds) {
  const currentTags = (outbounds || []).map((outbound) => outbound.tag);
  return (groups || []).filter(
    (group) => group.tag && !currentTags.includes(group.tag),
  );
}

/**
 * 从过滤后的列表中剔除已经导入配置的策略组。
 */
export function getSelectableGroups(groups, outbounds) {
  return (groups || []).filter(
    (group) => !isGroupImported(outbounds, group.tag),
  );
}

export function areAllGroupsSelected(groups, selectedTags) {
  const list = groups || [];
  if (list.length === 0) return false;
  const selected = selectedTags || [];
  return list.every((group) => selected.includes(group.tag));
}

export function toggleGroupSelection(selectedTags, selectableTags, selectAll) {
  const current = selectedTags || [];
  const tags = selectableTags || [];
  if (selectAll) {
    return current.filter((tag) => !tags.includes(tag));
  }
  return Array.from(new Set([...current, ...tags]));
}

export function invertGroupSelection(selectedTags, selectableTags) {
  const current = new Set(selectedTags || []);
  (selectableTags || []).forEach((tag) => {
    if (current.has(tag)) current.delete(tag);
    else current.add(tag);
  });
  return Array.from(current);
}

export function getGroupNodeCount(group) {
  if (!group?.static_nodes) return 0;
  try {
    const nodes =
      typeof group.static_nodes === "string"
        ? JSON.parse(group.static_nodes)
        : group.static_nodes;
    return Array.isArray(nodes) ? nodes.length : 0;
  } catch {
    return 0;
  }
}

export function formatGroupNodesDisplay(group) {
  try {
    const nodes =
      typeof group.static_nodes === "string"
        ? JSON.parse(group.static_nodes)
        : group.static_nodes;
    if (!Array.isArray(nodes)) return "无节点";
    const display = nodes.slice(0, 3).join(", ");
    return nodes.length > 3
      ? `${display}... (+${nodes.length - 3})`
      : display;
  } catch {
    return "解析错误";
  }
}

/**
 * 清空搜索词。返回新的搜索状态对象（不可变更新）。
 *
 * @returns {string} 总是返回空字符串
 */
export function clearSearchQuery() {
  return "";
}

export function buildGroupImportResult({
  group,
  nodePool,
  outbounds,
  sanitizeFn,
}) {
  const currentOutbounds = outbounds || [];
  if (!group?.tag || currentOutbounds.some((item) => item.tag === group.tag)) {
    return {
      outbounds: currentOutbounds,
      imported: false,
      addedNodeCount: 0,
    };
  }

  let nodeTags = [];
  try {
    nodeTags = JSON.parse(group.static_nodes || "[]");
    if (!Array.isArray(nodeTags)) nodeTags = [];
  } catch {
    nodeTags = [];
  }

  const nextOutbounds = [...currentOutbounds];
  let addedNodeCount = 0;
  nodeTags.forEach((tag) => {
    if (nextOutbounds.some((item) => item.tag === tag)) return;
    const node = (nodePool || []).find((item) => item.tag === tag);
    if (!node?.raw_json) return;

    try {
      const parsed = JSON.parse(node.raw_json);
      if (!parsed || typeof parsed !== "object") return;
      parsed.tag = node.tag;
      nextOutbounds.push(
        typeof sanitizeFn === "function" ? sanitizeFn(parsed) : parsed,
      );
      addedNodeCount++;
    } catch {
      // 忽略解析失败的节点，仍保留组内引用以便用户后续单独处理。
    }
  });

  const groupOutbound = {
    type: group.group_type,
    tag: group.tag,
    outbounds: nodeTags,
  };
  if (group.group_type === "urltest") {
    groupOutbound.url = group.url || "http://cp.cloudflare.com/generate_204";
    groupOutbound.interval = group.interval || "3m";
    groupOutbound.tolerance =
      group.tolerance !== null && group.tolerance !== undefined
        ? group.tolerance
        : 50;
  }

  return {
    outbounds: [...nextOutbounds, groupOutbound],
    imported: true,
    addedNodeCount,
  };
}
