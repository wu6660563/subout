import { computed } from "vue";
import {
  areAllGroupsSelected,
  clearSearchQuery,
  filterGroupsByQuery,
  getAvailableGroups,
  getSelectableGroups,
  invertGroupSelection,
  isGroupImported,
  toggleGroupSelection,
} from "../utils/groupImport.js";
import {
  filterNodePoolByQuery,
  getNodePoolStatus,
  getSelectableNodePoolNodes,
} from "../utils/nodePoolImport.js";

export const useImportSelections = ({
  configData,
  outboundGroups,
  groupImportModal,
  nodePoolModal,
  sanitizeOutboundItem,
  expandGroupImport,
  showToast,
}) => {
  const getNodeStatus = (node) =>
    getNodePoolStatus(node, configData.outbounds, sanitizeOutboundItem);

  const isGroupImportedForConfig = (tag) =>
    isGroupImported(configData.outbounds, tag);

  const availableGroupsToImport = computed(() =>
    getAvailableGroups(outboundGroups.value, configData.outbounds),
  );
  const filteredGroupsToImport = computed(() =>
    filterGroupsByQuery(outboundGroups.value, groupImportModal.searchQuery),
  );
  const selectableGroupsToImport = computed(() =>
    getSelectableGroups(filteredGroupsToImport.value, configData.outbounds),
  );
  const isAllGroupsSelected = computed(() =>
    areAllGroupsSelected(
      selectableGroupsToImport.value,
      groupImportModal.selectedTags,
    ),
  );
  const toggleSelectAllGroups = () => {
    const selectableTags = selectableGroupsToImport.value.map(
      (group) => group.tag,
    );
    if (selectableTags.length === 0) return;
    groupImportModal.selectedTags = toggleGroupSelection(
      groupImportModal.selectedTags,
      selectableTags,
      isAllGroupsSelected.value,
    );
  };
  const invertGroupsSelection = () => {
    const selectableTags = selectableGroupsToImport.value.map(
      (group) => group.tag,
    );
    if (selectableTags.length === 0) return;
    groupImportModal.selectedTags = invertGroupSelection(
      groupImportModal.selectedTags,
      selectableTags,
    );
  };
  const confirmBatchGroupImport = () => {
    const selectedTags = [...(groupImportModal.selectedTags || [])];
    if (selectedTags.length === 0) {
      showToast("请先勾选要引入的分流出站组", "warning");
      return;
    }

    let count = 0;
    selectedTags.forEach((tag) => {
      const group = (outboundGroups.value || []).find(
        (item) => item.tag === tag,
      );
      if (group && !isGroupImportedForConfig(group.tag) && expandGroupImport(group)) {
        count++;
      }
    });
    groupImportModal.selectedTags = (groupImportModal.selectedTags || []).filter(
      (tag) => !isGroupImportedForConfig(tag),
    );
    if (count > 0) showToast(`已成功批量引入 ${count} 个分流出站组`);
  };
  const openGroupImport = () => {
    groupImportModal.searchQuery = clearSearchQuery();
    groupImportModal.selectedTags = [];
    groupImportModal.show = true;
  };
  const clearGroupSearchQuery = () => {
    groupImportModal.searchQuery = clearSearchQuery();
  };

  const filteredNodePoolNodes = computed(() =>
    filterNodePoolByQuery(
      nodePoolModal.nodes,
      nodePoolModal.searchQuery,
      configData.outbounds,
      sanitizeOutboundItem,
    ),
  );
  const selectableNodePoolNodes = computed(() =>
    getSelectableNodePoolNodes(
      filteredNodePoolNodes.value,
      configData.outbounds,
      sanitizeOutboundItem,
    ),
  );
  const hasSelectedUpdate = computed(() =>
    nodePoolModal.selectedIds.some((id) => {
      const node = nodePoolModal.nodes.find((item) => item.id === id);
      return node && getNodeStatus(node).status === "updated";
    }),
  );
  const isAllNodePoolSelected = computed(() => {
    const nodes = selectableNodePoolNodes.value;
    return (
      nodes.length > 0 &&
      nodes.every((node) => nodePoolModal.selectedIds.includes(node.id))
    );
  });
  const toggleSelectAllNodePool = () => {
    const selectableIds = selectableNodePoolNodes.value.map((node) => node.id);
    if (selectableIds.length === 0) return;
    if (isAllNodePoolSelected.value) {
      nodePoolModal.selectedIds = nodePoolModal.selectedIds.filter(
        (id) => !selectableIds.includes(id),
      );
      return;
    }
    nodePoolModal.selectedIds = Array.from(
      new Set([...nodePoolModal.selectedIds, ...selectableIds]),
    );
  };
  const invertNodePoolSelection = () => {
    const selectedIds = new Set(nodePoolModal.selectedIds);
    selectableNodePoolNodes.value.forEach((node) => {
      if (selectedIds.has(node.id)) selectedIds.delete(node.id);
      else selectedIds.add(node.id);
    });
    nodePoolModal.selectedIds = Array.from(selectedIds);
  };

  return {
    availableGroupsToImport,
    clearGroupSearchQuery,
    confirmBatchGroupImport,
    filteredGroupsToImport,
    filteredNodePoolNodes,
    getNodeStatus,
    invertGroupsSelection,
    invertNodePoolSelection,
    isAllGroupsSelected,
    isAllNodePoolSelected,
    isGroupImported: isGroupImportedForConfig,
    hasSelectedUpdate,
    openGroupImport,
    selectableGroupsToImport,
    selectableNodePoolNodes,
    toggleSelectAllGroups,
    toggleSelectAllNodePool,
  };
};
