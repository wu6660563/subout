import { describe, expect, it, vi } from "vitest";
import { reactive, ref } from "vue";
import { useConfigLoader } from "./useConfigLoader.js";

describe("useConfigLoader", () => {
  it("resets all sections when no saved config exists", async () => {
    const rawJson = reactive({ log: "old", dns: "old" });
    const parsers = { parseLog: vi.fn(), parseDns: vi.fn(), parseInbounds: vi.fn(), parseOutbounds: vi.fn(), parseRoute: vi.fn(), parseExperimental: vi.fn() };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [] })));
    const loader = useConfigLoader({
      apiBase: "", token: ref(""), sections: ["log", "dns"], configList: ref([]),
      currentConfigId: ref(2), currentConfigDetail: ref("old"), activeSection: ref("log"),
      isEditing: ref(true), runningConfig: {}, rawJson, outboundGroups: ref([]),
      fetchSystemInfo: vi.fn(), loadRunningConfigSettings: vi.fn(), loadConfigList: vi.fn(),
      parseConfigRoute: vi.fn(() => ({ isEditing: false })), loadNodePoolCache: vi.fn(), selectConfig: vi.fn(),
      ...parsers, showToast: vi.fn(),
    });
    await loader.loadAllSections();
    expect(rawJson).toEqual({ log: "", dns: "" });
    expect(parsers.parseLog).toHaveBeenCalledWith({});
  });
});
