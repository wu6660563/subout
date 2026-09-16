import { mergeSelectedNodePoolOutbounds } from "../utils/nodePoolImport.js";

export const useNodePoolImport = ({
  apiBase,
  token,
  nodePoolModal,
  groupImportModal,
  configData,
  sanitizeOutboundItem,
  expandGroupImport,
  showToast,
}) => {
  const openNodePoolImport = async () => {
    nodePoolModal.searchQuery = "";
    nodePoolModal.selectedIds = [];
    try {
      const response = await fetch(`${apiBase}/api/nodes?limit=100000`, {
        headers: { Authorization: `Bearer ${token.value}` },
      });
      if (response.ok) {
        const data = await response.json();
        nodePoolModal.nodes = data.nodes || [];
        nodePoolModal.show = true;
      } else {
        showToast("获取节点列表失败", "danger");
      }
    } catch {
      showToast("获取节点列表网络请求失败", "danger");
    }
  };

  const confirmNodePoolImport = () => {
    if (nodePoolModal.selectedIds.length === 0) {
      showToast("未选择任何节点", "warning");
      return;
    }
    const result = mergeSelectedNodePoolOutbounds({
      outbounds: configData.outbounds,
      nodes: nodePoolModal.nodes,
      selectedIds: nodePoolModal.selectedIds,
      sanitizeFn: sanitizeOutboundItem,
    });
    configData.outbounds = result.outbounds;
    const messages = [];
    if (result.importedCount > 0) messages.push(`新增导入 ${result.importedCount} 个节点`);
    if (result.updatedCount > 0) messages.push(`更新 ${result.updatedCount} 个节点`);
    if (result.skippedCount > 0) messages.push(`跳过 ${result.skippedCount} 个未变更节点`);
    if (messages.length > 0) {
      const type = result.updatedCount > 0 || result.importedCount > 0 ? "success" : "warning";
      showToast(`已完成: ${messages.join("，")}`, type);
    } else {
      showToast("未对配置做出更新", "warning");
    }
    nodePoolModal.show = false;
  };

  const importGroup = (group) => {
    expandGroupImport(group);
    if (groupImportModal.selectedTags) {
      groupImportModal.selectedTags = groupImportModal.selectedTags.filter((tag) => tag !== group.tag);
    }
  };

  return { openNodePoolImport, confirmNodePoolImport, importGroup };
};
