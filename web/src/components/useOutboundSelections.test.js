import { describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import { useOutboundSelections } from "./useOutboundSelections.js";

describe("useOutboundSelections", () => {
  it("classifies outbounds and batch-removes selected groups with orphan nodes", async () => {
    const configData = reactive({
      outbounds: [
        { type: "direct", tag: "direct" },
        { type: "selector", tag: "group", outbounds: ["node"] },
        { type: "vless", tag: "node" },
        { type: "trojan", tag: "keep" },
      ],
    });
    const confirmDialog = vi.fn(async () => true);
    const showToast = vi.fn();
    const editItem = vi.fn();
    const selections = useOutboundSelections({
      configData,
      confirmDialog,
      editItem,
      showToast,
    });

    expect(selections.basicOutbounds.value.map((item) => item.tag)).toEqual([
      "direct",
    ]);
    expect(selections.groupOutbounds.value.map((item) => item.tag)).toEqual([
      "group",
    ]);
    expect(selections.proxyOutbounds.value.map((item) => item.tag)).toEqual([
      "node",
      "keep",
    ]);

    selections.toggleGroupSelection("group", true);
    await selections.batchRemoveGroups();

    expect(configData.outbounds.map((item) => item.tag)).toEqual(["direct", "keep"]);
    expect(showToast).toHaveBeenCalledWith(
      "已批量删除选中的 1 个策略组，并移除 1 个孤立代理节点",
    );
  });
});
