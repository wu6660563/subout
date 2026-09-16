import { describe, expect, it, vi } from "vitest";
import { reactive, ref } from "vue";
import { useNodePoolImport } from "./useNodePoolImport.js";

describe("useNodePoolImport", () => {
  it("rejects an empty node selection", () => {
    const showToast = vi.fn();
    const controller = useNodePoolImport({
      apiBase: "", token: ref(""),
      nodePoolModal: reactive({ searchQuery: "", selectedIds: [], nodes: [], show: false }),
      groupImportModal: reactive({ selectedTags: [] }),
      configData: reactive({ outbounds: [] }),
      sanitizeOutboundItem: (item) => item,
      expandGroupImport: vi.fn(), showToast,
    });
    controller.confirmNodePoolImport();
    expect(showToast).toHaveBeenCalledWith("未选择任何节点", "warning");
  });
});
