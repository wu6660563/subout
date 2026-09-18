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

  it("preserves local rule-set format during visual save normalization", () => {
    const itemModal = reactive({
      mode: "visual",
      itemType: "route_ruleset",
      itemData: {
        type: "local",
        tag: "local-rules",
        path: "rules/local.json",
        format: "source",
        url: "https://example.com/unused",
        download_detour: "proxy",
        update_interval: "1d",
      },
      jsonText: "",
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
      normalizeStandardRuleFields: vi.fn((data) => ({ ...data })),
      serializeItemDataForSource: vi.fn((data) => data),
    });

    controller.syncVisualToItemData();

    expect(itemModal.itemData).toMatchObject({
      type: "local",
      path: "rules/local.json",
      format: "source",
    });
    expect(itemModal.itemData).not.toHaveProperty("url");
    expect(itemModal.itemData).not.toHaveProperty("download_detour");
    expect(itemModal.itemData).not.toHaveProperty("update_interval");
  });
});
