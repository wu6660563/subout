import { buildGroupImportResult } from "../utils/groupImport.js";

export const useOutboundEditorActions = ({
  configData,
  editItem,
  confirmDialog,
  isGroupOutbound,
  removeSelectedGroupsAndOrphanedProxyNodes,
  nodePoolCache,
  sanitizeOutboundItem,
  showToast,
}) => {
  const editBasicOutbound = (outbound) => {
    const index = configData.outbounds.findIndex((item) => item.tag === outbound.tag);
    if (index === -1) return;
    editItem(outbound, "outbound", (parsed) => { configData.outbounds[index] = parsed; }, index);
  };

  const addBasicOutbound = () => {
    editItem({ tag: `outbound-${Date.now() % 10000}`, type: "direct" }, "outbound", (parsed) => {
      configData.outbounds.push(parsed);
    });
  };

  const addProxyOutbound = () => {
    editItem({ tag: `proxy-${Date.now() % 10000}`, type: "vmess", server: "", port: 443 }, "outbound", (parsed) => {
      configData.outbounds.push(parsed);
    });
  };

  const confirmRemoveOutbound = async (index) => {
    const outbound = configData.outbounds[index];
    if (!outbound) return;
    if (!(await confirmDialog(`确定要删除出站连接 "${outbound.tag}" 吗？`, { isDanger: true }))) return;
    if (isGroupOutbound(outbound)) {
      const removed = removeSelectedGroupsAndOrphanedProxyNodes([outbound.tag]);
      showToast(`已删除策略组: ${outbound.tag}${removed > 0 ? `，并移除 ${removed} 个孤立代理节点` : ""}`);
    } else {
      configData.outbounds.splice(index, 1);
      showToast(`已删除出站连接: ${outbound.tag}`);
    }
  };

  const expandGroupImport = (group) => {
    const result = buildGroupImportResult({
      group,
      nodePool: nodePoolCache.value,
      outbounds: configData.outbounds,
      sanitizeFn: sanitizeOutboundItem,
    });
    if (!result.imported) {
      showToast(`出站组 "${group.tag}" 已存在于配置中`, "warning");
      return false;
    }
    configData.outbounds = result.outbounds;
    showToast(`已导入出站组 "${group.tag}" 及 ${result.addedNodeCount} 个节点（配置已自包含，DB 变更不再影响）`);
    return true;
  };

  return { editBasicOutbound, addBasicOutbound, addProxyOutbound, confirmRemoveOutbound, expandGroupImport };
};
