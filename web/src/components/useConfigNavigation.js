import { ref, watch } from "vue";
import { useConfigPagination } from "./useConfigPagination.js";
import { parseConfigRoute as parseConfigRouteFromHash } from "./configRouteUtils.js";

export const useConfigNavigation = ({
  sections,
  activeSection,
  currentConfigId,
  configList,
  showToast,
  loadNodePoolCache,
  selectConfig,
}) => {
  const isEditing = ref(false);
  const { currentPage, pageSize, paginatedConfigs } = useConfigPagination(configList);
  const parseConfigRoute = () => parseConfigRouteFromHash(window.location.hash, sections);

  const backToList = () => {
    isEditing.value = false;
    if (window.location.hash !== "#configs") window.location.hash = "#configs";
  };

  const syncFromRoute = async () => {
    const routeState = parseConfigRoute();
    if (routeState.isEditing && routeState.configId) {
      if (routeState.tab && sections.includes(routeState.tab)) activeSection.value = routeState.tab;
      if (!isEditing.value || currentConfigId.value !== routeState.configId) {
        const exists = configList.value.some((item) => item.id === routeState.configId);
        if (exists) {
          currentConfigId.value = routeState.configId;
          await selectConfig(routeState.configId);
          isEditing.value = true;
        } else if (configList.value.length > 0) {
          showToast(`未找到 ID 为 #${routeState.configId} 的配置`, "warning");
          backToList();
        }
      }
    } else {
      isEditing.value = false;
    }
  };

  watch(activeSection, (newTab) => {
    if (isEditing.value && currentConfigId.value) {
      const targetHash = `#configs/edit/${currentConfigId.value}/${newTab}`;
      if (window.location.hash !== targetHash) window.location.hash = targetHash;
    }
  });

  const startEditConfig = async (id) => {
    await loadNodePoolCache();
    await selectConfig(id);
    isEditing.value = true;
    const targetHash = `#configs/edit/${id}/${activeSection.value}`;
    if (window.location.hash !== targetHash) window.location.hash = targetHash;
  };

  return { isEditing, currentPage, pageSize, paginatedConfigs, parseConfigRoute, backToList, syncFromRoute, startEditConfig };
};
