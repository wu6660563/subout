import { describe, expect, it, vi } from "vitest";
import { reactive, ref } from "vue";
import { useItemEditorLifecycle } from "./useItemEditorLifecycle.js";

describe("useItemEditorLifecycle", () => {
  it("opens a new inbound with defaults", () => {
    const itemModal = reactive({ itemType: "", mode: "", error: "", onSave: null, idx: -1, title: "", itemData: {}, tempFields: {}, jsonText: "", show: false, routeRuleLogic: "standard", dnsRuleType: "domain_suffix" });
    const controller = useItemEditorLifecycle({
      itemModal,
      configData: { inbounds: [] },
      presetUrlSelectConfig: ref(""),
      ITEM_ARRAY_FIELDS: [],
      buildItemTempFields: vi.fn(() => ({})),
      mergeLogicalRuleTempFields: vi.fn(() => ({})),
    });
    controller.addInbound();
    expect(itemModal.itemType).toBe("inbound");
    expect(itemModal.itemData.type).toBe("mixed");
    expect(itemModal.show).toBe(true);
  });
});
