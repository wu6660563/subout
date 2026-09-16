import { describe, expect, it, vi } from "vitest";
import { reactive, ref } from "vue";
import { useImportSelections } from "./useImportSelections.js";

describe("useImportSelections", () => {
  it("coordinates group and node-pool selection against the current outbounds", () => {
    const configData = reactive({
      outbounds: [{ tag: "existing", type: "vless", server: "1.1.1.1" }],
    });
    const outboundGroups = ref([
      { tag: "auto", group_type: "urltest", static_nodes: "[]" },
      { tag: "manual", group_type: "selector", static_nodes: "[]" },
    ]);
    const groupImportModal = reactive({ show: false, searchQuery: "", selectedTags: [] });
    const nodePoolModal = reactive({
      show: false,
      searchQuery: "",
      selectedIds: [],
      nodes: [
        {
          id: 1,
          tag: "existing",
          raw_json: '{"type":"vless","server":"1.1.1.1"}',
        },
        {
          id: 2,
          tag: "new-node",
          raw_json: '{"type":"trojan","server":"2.2.2.2"}',
        },
      ],
    });
    const showToast = vi.fn();
    const expandGroupImport = vi.fn((group) => {
      configData.outbounds = [
        ...configData.outbounds,
        { tag: group.tag, type: group.group_type },
      ];
      return true;
    });
    const selections = useImportSelections({
      configData,
      outboundGroups,
      groupImportModal,
      nodePoolModal,
      sanitizeOutboundItem: (item) => item,
      expandGroupImport,
      showToast,
    });

    expect(selections.selectableGroupsToImport.value.map((group) => group.tag)).toEqual([
      "auto",
      "manual",
    ]);
    selections.toggleSelectAllGroups();
    expect(groupImportModal.selectedTags).toEqual(["auto", "manual"]);
    selections.confirmBatchGroupImport();
    expect(expandGroupImport).toHaveBeenCalledTimes(2);
    expect(groupImportModal.selectedTags).toEqual([]);
    expect(showToast).toHaveBeenCalledWith("已成功批量引入 2 个分流出站组");

    expect(selections.selectableNodePoolNodes.value.map((node) => node.id)).toEqual([2]);
    selections.toggleSelectAllNodePool();
    expect(nodePoolModal.selectedIds).toEqual([2]);
    selections.invertNodePoolSelection();
    expect(nodePoolModal.selectedIds).toEqual([]);
  });
});
