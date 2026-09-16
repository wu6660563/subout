import { describe, expect, it, vi } from "vitest";
import { reactive, ref } from "vue";
import { useConfigImport } from "./useConfigImport.js";

describe("useConfigImport", () => {
  it("opens a clean import modal and detects existing configuration content", () => {
    const configData = reactive({ dns: { servers: [] }, inbounds: [], outbounds: [], route: { rules: [], rule_set: [] } });
    const controller = useConfigImport({ configData, rawJson: reactive({}), apiBase: "", token: ref(""), isLinux: ref(true), isApplePlatform: ref(false), showToast: vi.fn() });
    controller.importModal.content = "old";
    controller.openImportModal();
    expect(controller.importModal).toMatchObject({ show: true, content: "", error: "", validating: false });
    expect(controller.hasConfigContent()).toBe(false);
    configData.outbounds.push({ tag: "proxy" });
    expect(controller.hasConfigContent()).toBe(true);
  });
});
