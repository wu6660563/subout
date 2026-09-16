import { describe, expect, it } from "vitest";
import { nextTick, ref } from "vue";
import { useConfigPagination } from "./useConfigPagination.js";

describe("useConfigPagination", () => {
  it("slices pages and corrects an out-of-range page", async () => {
    const list = ref([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const pagination = useConfigPagination(list);
    pagination.pageSize.value = 2;
    pagination.currentPage.value = 2;
    expect(pagination.paginatedConfigs.value).toEqual([{ id: 3 }]);
    list.value = [{ id: 1 }];
    await nextTick();
    expect(pagination.currentPage.value).toBe(1);
  });
});
