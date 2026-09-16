// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import OutboundConfigGuide from "./OutboundConfigGuide.vue";

describe("OutboundConfigGuide", () => {
  it("renders the outbound configuration guidance", () => {
    const wrapper = mount(OutboundConfigGuide);

    expect(wrapper.text()).toContain("配置指南");
    expect(wrapper.text()).toContain("基础出站");
    expect(wrapper.text()).toContain("代理节点");
    expect(wrapper.text()).toContain("出站组");
    expect(wrapper.text()).toContain("推荐流程");
  });
});
