// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import OutboundGroupConfigEditor from "./OutboundGroupConfigEditor.vue";

describe("OutboundGroupConfigEditor", () => {
  it("renders groups and emits management actions", async () => {
    const group = {
      tag: "auto-group",
      type: "urltest",
      outbounds: ["node-a"],
      url: "https://example.com/health",
      interval: "5m",
    };
    const configData = { outbounds: [group] };
    const wrapper = mount(OutboundGroupConfigEditor, {
      props: {
        configData,
        groupOutbounds: [group],
        selectedGroupTags: [],
        isAllOutboundGroupsSelected: false,
      },
    });

    expect(wrapper.text()).toContain("策略组 (Selector / URLTest)");
    expect(wrapper.text()).toContain("自动测速 (URLTest)");
    expect(wrapper.text()).toContain("1 个");

    await wrapper.find("input[type='checkbox']").setValue(true);
    expect(wrapper.emitted("toggle-group-selection")).toEqual([
      ["auto-group", true],
    ]);

    const buttons = wrapper.findAll("button");
    await buttons.find((button) => button.text().includes("从分流出站组引入")).trigger("click");
    expect(wrapper.emitted("open-group-import")).toHaveLength(1);
    await buttons.find((button) => button.text() === "编辑").trigger("click");
    expect(wrapper.emitted("edit-item")).toEqual([[group]]);
    await buttons.find((button) => button.text() === "删除").trigger("click");
    expect(wrapper.emitted("remove-outbound")).toEqual([[0]]);
  });

  it("reflects the parent-controlled select-all state", () => {
    const wrapper = mount(OutboundGroupConfigEditor, {
      props: {
        configData: { outbounds: [{ tag: "group", type: "selector" }] },
        groupOutbounds: [{ tag: "group", type: "selector" }],
        selectedGroupTags: ["group"],
        isAllOutboundGroupsSelected: true,
      },
    });

    expect(wrapper.text()).toContain("取消全选");
  });

  it("shows a helpful empty state", () => {
    const wrapper = mount(OutboundGroupConfigEditor, {
      props: { configData: { outbounds: [] }, groupOutbounds: [] },
    });

    expect(wrapper.text()).toContain("暂无策略组");
  });
});
