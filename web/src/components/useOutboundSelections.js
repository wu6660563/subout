import { computed, ref } from "vue";
import {
  getOutboundTags,
  getOutboundTypeBuckets,
  removeGroupsAndOrphanedProxyNodes,
  toggleSelectedTag,
} from "./outboundManagementUtils.js";

export const useOutboundSelections = ({
  configData,
  confirmDialog,
  editItem,
  showToast,
}) => {
  const allOutboundTags = computed(() => getOutboundTags(configData.outbounds));
  const outboundTypeBuckets = computed(() =>
    getOutboundTypeBuckets(configData.outbounds),
  );
  const basicOutbounds = computed(() => outboundTypeBuckets.value.basic);
  const groupOutbounds = computed(() => outboundTypeBuckets.value.groups);
  const proxyOutbounds = computed(() => outboundTypeBuckets.value.proxies);

  const selectedGroupTags = ref([]);
  const isAllOutboundGroupsSelected = computed(
    () =>
      groupOutbounds.value.length > 0 &&
      groupOutbounds.value.every((outbound) =>
        selectedGroupTags.value.includes(outbound.tag),
      ),
  );
  const toggleGroupSelection = (tag, selected) => {
    selectedGroupTags.value = toggleSelectedTag(
      selectedGroupTags.value,
      tag,
      selected,
    );
  };
  const toggleSelectAllOutboundGroups = () => {
    selectedGroupTags.value = isAllOutboundGroupsSelected.value
      ? []
      : groupOutbounds.value.map((outbound) => outbound.tag);
  };
  const removeSelectedGroupsAndOrphanedProxyNodes = (groupTags) => {
    const result = removeGroupsAndOrphanedProxyNodes(
      configData.outbounds,
      groupTags,
    );
    configData.outbounds = result.outbounds;
    return result.orphanedProxyCount;
  };
  const batchRemoveGroups = async () => {
    const count = selectedGroupTags.value.length;
    if (count === 0) return;
    const confirmed = await confirmDialog(
      `确定要批量删除选中的 ${count} 个策略组吗？`,
      { isDanger: true },
    );
    if (!confirmed) return;

    const orphanedProxyCount = removeSelectedGroupsAndOrphanedProxyNodes(
      selectedGroupTags.value,
    );
    selectedGroupTags.value = [];
    showToast(
      `已批量删除选中的 ${count} 个策略组${
        orphanedProxyCount > 0
          ? `，并移除 ${orphanedProxyCount} 个孤立代理节点`
          : ""
      }`,
    );
  };

  const selectedProxyTags = ref([]);
  const isAllProxiesSelected = computed(
    () =>
      proxyOutbounds.value.length > 0 &&
      proxyOutbounds.value.every((outbound) =>
        selectedProxyTags.value.includes(outbound.tag),
      ),
  );
  const toggleProxySelection = (tag, selected) => {
    selectedProxyTags.value = toggleSelectedTag(
      selectedProxyTags.value,
      tag,
      selected,
    );
  };
  const toggleSelectAllProxies = () => {
    selectedProxyTags.value = isAllProxiesSelected.value
      ? []
      : proxyOutbounds.value.map((outbound) => outbound.tag);
  };
  const batchRemoveProxies = async () => {
    const count = selectedProxyTags.value.length;
    if (count === 0) return;
    const confirmed = await confirmDialog(
      `确定要批量删除选中的 ${count} 个代理节点吗？`,
      { isDanger: true },
    );
    if (!confirmed) return;

    const tags = new Set(selectedProxyTags.value);
    configData.outbounds = (configData.outbounds || []).filter(
      (outbound) => !tags.has(outbound.tag),
    );
    selectedProxyTags.value = [];
    showToast(`已批量删除选中的 ${count} 个代理节点`);
  };

  const editOutbound = (outbound) => {
    const index = configData.outbounds.findIndex(
      (item) => item.tag === outbound.tag,
    );
    if (index < 0) return;
    editItem(
      outbound,
      "outbound",
      (parsed) => {
        configData.outbounds[index] = parsed;
      },
      index,
    );
  };

  return {
    allOutboundTags,
    basicOutbounds,
    batchRemoveGroups,
    batchRemoveProxies,
    editGroupOutbound: editOutbound,
    editProxyOutbound: editOutbound,
    groupOutbounds,
    isAllOutboundGroupsSelected,
    isAllProxiesSelected,
    proxyOutbounds,
    removeSelectedGroupsAndOrphanedProxyNodes,
    selectedGroupTags,
    selectedProxyTags,
    toggleGroupSelection,
    toggleProxySelection,
    toggleSelectAllOutboundGroups,
    toggleSelectAllProxies,
  };
};
