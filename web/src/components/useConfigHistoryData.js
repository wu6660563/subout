export const useConfigHistoryData = ({
  apiBase,
  token,
  configList,
  activeConfigId,
  currentConfigId,
  currentConfigDetail,
  rawJson,
  configData,
  outboundGroups,
  nodePoolCache,
  selectedGroupTags,
  selectedProxyTags,
  parseLog,
  parseDns,
  parseInbounds,
  parseOutbounds,
  parseRoute,
  parseExperimental,
  confirmDialog,
  showToast,
  refreshAll,
}) => {

const loadConfigList = async () => {
  try {
    const res = await fetch(`${apiBase}/api/config/history`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        configList.value = data;
        activeConfigId.value = null;
      } else {
        configList.value = data.items || [];
        activeConfigId.value = data.active_id;
      }
    }
  } catch (e) {
    console.error("加载配置列表失败", e);
  }
};

const updateConfigSortOrder = async (item) => {
  const sortOrder = Number(item.sort_order);
  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    showToast("排序值必须是大于等于 0 的整数", "warning");
    await loadConfigList();
    return;
  }
  try {
    const res = await fetch(`${apiBase}/api/config/history/${item.id}/order`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify({ sort_order: sortOrder }),
    });
    if (res.ok) {
      await loadConfigList();
    } else {
      showToast("保存排序值失败", "danger");
      await loadConfigList();
    }
  } catch {
    showToast("保存排序值网络请求失败", "danger");
    await loadConfigList();
  }
};

const selectConfig = async (id) => {
  if (!id) return;
  currentConfigId.value = id;
  await loadHistoryConfig(id);
};



const syncLatestResources = async (id, name) => {
  const confirmed = await confirmDialog(
    `确定要将系统最新的节点池和分流出站组同步到配置 "${name || "#" + id}" 吗？\n\n💡 提示：此操作将使用系统当前最新的全部节点和出站组更新该配置的出站列表。\n⚠️ 注意：若原本配置绑定的部分老节点在当前节点池中已不存在，程序将自动将对应 route 路由项绑定的出口重置为 direct（直连）。`,
    {
      title: "同步最新资源",
      confirmText: "确认同步",
    },
  );
  if (!confirmed) return;

  try {
    const res = await fetch(
      `${apiBase}/api/config/history/${id}/sync-resources`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token.value}` },
      },
    );
    if (res.ok) {
      const data = await res.json();
      let msg = `已成功同步最新资源（包含 ${data.nodes_count} 个节点、${data.groups_count} 个出站组）`;
      if (data.repaired_routes && data.repaired_routes.length > 0) {
        msg += `，并自动修复了 ${data.repaired_routes.length} 处失效路由出口为 direct`;
      }
      if (data.is_running && data.restarted) {
        msg += "，核心服务已重新加载配置生效";
      }
      showToast(msg, "success");
      await refreshAll();
    } else {
      const errText = await res.text();
      showToast(`同步失败: ${errText || "接口错误"}`, "danger");
    }
  } catch (e) {
    showToast(`同步失败: ${e.message || "网络请求错误"}`, "danger");
  }
};

const exportConfigById = async (id, name) => {
  try {
    const res = await fetch(`${apiBase}/api/config/history/${id}`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      const detailItem = await res.json();
      const content = detailItem.content || "{}";
      const blob = new Blob([content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `subout-config-${name || id}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("配置已成功导出");
    } else {
      showToast("导出失败：获取配置内容失败", "danger");
    }
  } catch {
    showToast("导出失败：网络请求出错", "danger");
  }
};

const migrateLegacyGroupOutbounds = () => {
  // 旧格式配置的 selector/urltest 可能只存了 {tag, type} 引用而无 outbounds 字段。
  // 这里检测并从 DB 展开，把缺失节点的 raw_json 也补全进配置。
  let migrated = 0;
  configData.outbounds.forEach((o) => {
    if (
      ["selector", "urltest"].includes(o.type) &&
      (!o.outbounds || o.outbounds.length === 0)
    ) {
      const dbGroup = outboundGroups.value.find((g) => g.tag === o.tag);
      if (dbGroup) {
        let nodeTags = [];
        try {
          nodeTags = JSON.parse(dbGroup.static_nodes || "[]");
          if (!Array.isArray(nodeTags)) nodeTags = [];
        } catch {
          nodeTags = [];
        }

        // 补全缺失的节点（深拷贝 raw_json）
        for (const tag of nodeTags) {
          if (!configData.outbounds.some((x) => x.tag === tag)) {
            const node = nodePoolCache.value.find((n) => n.tag === tag);
            if (node) {
              try {
                const p = JSON.parse(node.raw_json);
                if (p && typeof p === "object") {
                  p.tag = node.tag;
                  configData.outbounds.push(p);
                }
              } catch {
                // 忽略解析失败
              }
            }
          }
        }

        o.outbounds = nodeTags;
        if (dbGroup.group_type === "urltest") {
          o.url =
            o.url || dbGroup.url || "http://cp.cloudflare.com/generate_204";
          o.interval = o.interval || dbGroup.interval || "3m";
          o.tolerance =
            o.tolerance !== undefined ? o.tolerance : (dbGroup.tolerance ?? 50);
        }
        migrated++;
      }
    }
  });

  if (migrated > 0) {
    showToast(
      `检测到旧格式配置，已自动展开 ${migrated} 个出站组引用。保存后生效。`,
      "warning",
    );
  }
};

const loadHistoryConfig = async (id) => {
  try {
    const res = await fetch(`${apiBase}/api/config/history/${id}`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (res.ok) {
      const detailItem = await res.json();
      currentConfigDetail.value = detailItem.detail || "";
      const base = JSON.parse(detailItem.content || "{}");
      rawJson.log = JSON.stringify(base.log || {}, null, 2);
      rawJson.dns = JSON.stringify(base.dns || {}, null, 2);
      rawJson.inbounds = JSON.stringify(base.inbounds || [], null, 2);
      rawJson.outbounds = JSON.stringify(base.outbounds || [], null, 2);
      rawJson.route = JSON.stringify(base.route || {}, null, 2);
      rawJson.experimental = JSON.stringify(base.experimental || {}, null, 2);

      parseLog(base.log || {});
      parseDns(base.dns || {});
      parseInbounds(base.inbounds || []);
      parseOutbounds(base.outbounds || []);
      parseRoute(base.route || {});
      parseExperimental(base.experimental || {});

      // 旧配置迁移：把 selector/urltest 的引用展开为自包含快照
      migrateLegacyGroupOutbounds();
      selectedGroupTags.value = [];
      selectedProxyTags.value = [];
    }
  } catch {
    showToast("加载配置详情失败", "danger");
  }
};

  return {
    loadConfigList,
    updateConfigSortOrder,
    selectConfig,
    syncLatestResources,
    exportConfigById,
    loadHistoryConfig,
  };
};
