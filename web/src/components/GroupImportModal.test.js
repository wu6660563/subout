// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import GroupImportModal from "./GroupImportModal.vue";

const createModal = () =>
  reactive({
    show: true,
    searchQuery: "",
    selectedTags: ["auto-proxy"],
  });

const group = {
  tag: "auto-proxy",
  type: "urltest",
  members: ["proxy-1", "proxy-2"],
  isImported: false,
};

describe("GroupImportModal", () => {
  const mountModal = () =>
    mount(GroupImportModal, {
      props: {
        groupImportModal: createModal(),
        outboundGroups: [group],
        availableGroupsToImport: [group],
        filteredGroupsToImport: [group],
        selectableGroupsToImport: [group],
       isAllGroupsSelected: false,
       isGroupImported: () => false,
       getGroupNodeCount: () => 2,
       getGroupNodesDisplay: () => "proxy-1, proxy-2",
        importGroup: () => {},
      },
    });

  it("renders groups and emits selection actions", async () => {
    const wrapper = mountModal();

    expect(wrapper.text()).toContain("auto-proxy");
    expect(wrapper.text()).toContain("可引入 1 个");

    await wrapper.find("input[type='checkbox']").trigger("change");
    expect(wrapper.emitted("toggle-select-all")).toHaveLength(1);

    const importButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("批量引入所选"));
    await importButton.trigger("click");
    expect(wrapper.emitted("confirm-import")).toHaveLength(1);
  });

  it("emits close from the header", async () => {
    const wrapper = mountModal();

    await wrapper.get(".modal-header svg").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
