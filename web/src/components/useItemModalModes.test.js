import { describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import { useItemModalModes } from "./useItemModalModes.js";

describe("useItemModalModes", () => {
  it("switches a valid source item into visual mode", () => {
    const itemModal = reactive({
      mode: "source",
      itemType: "outbound",
      itemData: {},
      jsonText: '{"tag":"direct","type":"direct"}',
      error: "",
      routeRuleLogic: "standard",
      tempFields: {},
    });
    const controller = useItemModalModes({
      itemModal,
      isLinux: { value: true },
      ITEM_ARRAY_FIELDS: [],
      ITEM_ARRAY_FIELDS_WITHOUT_PORT: [],
      buildItemTempFields: vi.fn(() => ({})),
      buildLogicalRuleCriteria: vi.fn(() => []),
      normalizeStandardRuleFields: vi.fn((data) => data),
      serializeItemDataForSource: vi.fn((data) => data),
    });

    controller.setItemModalMode("visual");
    expect(itemModal.mode).toBe("visual");
    expect(itemModal.itemData.type).toBe("direct");
    expect(itemModal.error).toBe("");
  });
});
