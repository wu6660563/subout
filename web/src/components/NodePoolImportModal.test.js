// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import NodePoolImportModal from "./NodePoolImportModal.vue";

const createModal = () =>
  reactive({
    show: true,
    searchQuery: "",
    nodes: [
      {
        id: "node-1",
        tag: "proxy-1",
        type: "vmess",
        address: "example.com",
        port: 443,
      },
    ],
    selectedIds: [],
  });

describe("NodePoolImportModal", () => {
  it("renders node counts and emits selection actions", async () => {
    const wrapper = mount(NodePoolImportModal, {
      props: {
        nodePoolModal: createModal(),
        filteredNodePoolNodes: [
          {
            id: "node-1",
            tag: "proxy-1",
            type: "vmess",
            address: "example.com",
            port: 443,
          },
        ],
        selectableNodePoolNodes: [
          {
            id: "node-1",
            tag: "proxy-1",
            type: "vmess",
            address: "example.com",
            port: 443,
          },
        ],
        hasSelectedUpdate: false,
        isAllNodePoolSelected: false,
        getNodeStatus: () => ({ status: "new" }),
      },
    });

    expect(wrapper.text()).toContain("proxy-1");
    expect(wrapper.text()).toContain("可引入/更新: 1");

    await wrapper.find("input[type='checkbox']").trigger("change");
    expect(wrapper.emitted("toggle-select-all")).toHaveLength(1);

    const confirmButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("导入所选节点"));
    await confirmButton.trigger("click");
    expect(wrapper.emitted("confirm-import")).toHaveLength(1);
  });

  it("emits close from the modal controls", async () => {
    const wrapper = mount(NodePoolImportModal, {
      props: {
        nodePoolModal: createModal(),
        filteredNodePoolNodes: [],
        selectableNodePoolNodes: [],
        hasSelectedUpdate: false,
        isAllNodePoolSelected: false,
        getNodeStatus: () => ({ status: "new" }),
      },
    });

    await wrapper.get(".modal-header svg").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
