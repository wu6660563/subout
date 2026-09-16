import { computed, ref, watch } from "vue";

export const useConfigPagination = (configList) => {
  const currentPage = ref(1);
  const pageSize = ref(10);
  const paginatedConfigs = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;
    return configList.value.slice(start, start + pageSize.value);
  });
  watch(configList, (items) => {
    const maxPage = Math.max(1, Math.ceil(items.length / pageSize.value));
    if (currentPage.value > maxPage) currentPage.value = maxPage;
  });
  watch(pageSize, () => {
    currentPage.value = 1;
  });
  return { currentPage, pageSize, paginatedConfigs };
};
