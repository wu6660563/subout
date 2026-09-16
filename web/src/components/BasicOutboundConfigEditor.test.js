// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import BasicOutboundConfigEditor from "./BasicOutboundConfigEditor.vue";

describe("BasicOutboundConfigEditor", () => {
  it("renders basic outbounds and emits editor actions", async () => {
    const configData = reactive({
      outbounds: [
        { tag: "direct", type: "direct" },
        { tag: "block", type: "block" },
      ],
    });
    const basicOutbounds = [configData.outbounds[0], configData.outbounds[1]];
    const wrapper = mount(BasicOutboundConfigEditor, {
      props: { configData, basicOutbounds },
    });

    expect(wrapper.text()).toContain("基础出站连接");
    expect(wrapper.text()).toContain("直连 (Direct)");
    expect(wrapper.text()).toContain("阻断 (Block)");

    await wrapper.find("button").trigger("click");
    expect(wrapper.emitted("add-basic-outbound")).toHaveLength(1);

    const buttons = wrapper.findAll("button");
    await buttons.find((button) => button.text() === "编辑").trigger("click");
    expect(wrapper.emitted("edit-item")).toEqual([[basicOutbounds[0]]]);

    await buttons.find((button) => button.text() === "删除").trigger("click");
    expect(wrapper.emitted("remove-outbound")).toEqual([[0]]);
  });

  it("renders an empty state when no basic outbounds exist", () => {
    const wrapper = mount(BasicOutboundConfigEditor, {
      props: { configData: { outbounds: [] }, basicOutbounds: [] },
    });

    expect(wrapper.text()).toContain("暂无基础出站");
  });
});
