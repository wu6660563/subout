import { describe, expect, it, vi } from "vitest";
import { reactive, ref } from "vue";
import { useConfigHistoryData } from "./useConfigHistoryData.js";

describe("useConfigHistoryData", () => {
  it("loads both legacy array and paged history responses", async () => {
    const responses = [
      { ok: true, json: async () => [{ id: 1 }] },
      { ok: true, json: async () => ({ items: [{ id: 2 }], active_id: 2 }) },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => responses.shift()));
    const configList = ref([]);
    const activeConfigId = ref(null);
    const controller = useConfigHistoryData({
      apiBase: "",
      token: ref(""),
      configList,
      activeConfigId,
      currentConfigId: ref(null),
      currentConfigDetail: ref(""),
      rawJson: reactive({}),
      configData: { outbounds: [] },
      outboundGroups: ref([]),
      nodePoolCache: ref([]),
      selectedGroupTags: ref([]),
      selectedProxyTags: ref([]),
      parseLog: vi.fn(), parseDns: vi.fn(), parseInbounds: vi.fn(),
      parseOutbounds: vi.fn(), parseRoute: vi.fn(), parseExperimental: vi.fn(),
      confirmDialog: vi.fn(), showToast: vi.fn(), refreshAll: vi.fn(),
    });

    await controller.loadConfigList();
    expect(configList.value).toEqual([{ id: 1 }]);
    await controller.loadConfigList();
    expect(configList.value).toEqual([{ id: 2 }]);
    expect(activeConfigId.value).toBe(2);
  });
});
