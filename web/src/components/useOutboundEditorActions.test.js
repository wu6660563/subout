import { describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import { useOutboundEditorActions } from "./useOutboundEditorActions.js";

describe("useOutboundEditorActions", () => {
  it("adds a direct outbound through the shared editor callback", () => {
    const configData = reactive({ outbounds: [] });
    const editItem = vi.fn((item, type, save) => save({ ...item, tag: "direct" }));
    const actions = useOutboundEditorActions({
      configData, editItem, confirmDialog: vi.fn(), isGroupOutbound: vi.fn(),
      removeSelectedGroupsAndOrphanedProxyNodes: vi.fn(), nodePoolCache: { value: [] },
      sanitizeOutboundItem: (item) => item, showToast: vi.fn(),
    });
    actions.addBasicOutbound();
    expect(configData.outbounds).toEqual([{ tag: "direct", type: "direct" }]);
  });
});
