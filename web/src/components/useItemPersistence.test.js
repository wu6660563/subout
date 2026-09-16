import { describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import { useItemPersistence } from "./useItemPersistence.js";

describe("useItemPersistence", () => {
  it("validates a source item and clears stale errors", () => {
    const itemModal = reactive({
      show: true,
      mode: "source",
      itemType: "outbound",
      jsonText: '{"tag":"direct","type":"direct"}',
      itemData: {},
      tempFields: {},
      routeRuleLogic: "standard",
      idx: -1,
      error: "old",
    });
    const controller = useItemPersistence({
      itemModal,
      configData: { outbounds: [] },
      isLinux: { value: true },
      syncVisualToItemData: vi.fn(),
      sanitizeOutboundItem: (item) => item,
      getOutboundGroupValidationError: vi.fn(() => null),
      validateData: vi.fn(() => ({ valid: true })),
      getListByType: vi.fn(() => null),
      getSerializedState: vi.fn(() => ({})),
      apiBase: "",
      token: { value: "" },
      showToast: vi.fn(),
      extractCriteriaFromObj: vi.fn(() => []),
      buildItemValidationData: vi.fn(() => ({})),
      ITEM_ARRAY_FIELDS_WITHOUT_PORT: [],
      getDuplicateItemTagError: vi.fn(() => null),
    });
    expect(controller.validateItemModal()).toBe(true);
    expect(itemModal.error).toBe("");
  });
});
