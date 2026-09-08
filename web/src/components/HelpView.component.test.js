// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

import HelpView from "./HelpView.vue";

describe("HelpView", () => {
  it("renders the supported sing-box version and all expert editor sections", () => {
    const wrapper = mount(HelpView);

    expect(wrapper.text()).toContain("sing-box 1.13.19");
    expect(wrapper.text()).toContain("系统操作流程");
    expect(wrapper.text()).toContain("log");
    expect(wrapper.text()).toContain("dns");
    expect(wrapper.text()).toContain("inbounds");
    expect(wrapper.text()).toContain("outbounds");
    expect(wrapper.text()).toContain("route");
    expect(wrapper.text()).toContain("experimental");
    expect(wrapper.text()).toContain("TLS 与证书配置");
  });

  it("filters sections with the in-page search", async () => {
    const wrapper = mount(HelpView);
    const input = wrapper.get('input[placeholder="搜索说明、字段或配置示例"]');

    await input.setValue("FakeIP");

    expect(wrapper.text()).toContain("FakeIP");
    expect(wrapper.text()).not.toContain("核心日志级别");
  });

  it("keeps table-of-contents navigation under the help route", () => {
    const wrapper = mount(HelpView);

    expect(wrapper.get('a[href="#help/quick-start"]').text()).toContain(
      "首次使用",
    );
  });

  it("copies a configuration snippet", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const wrapper = mount(HelpView);

    await wrapper.get('[data-copy="fakeip-example"]').trigger("click");

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("inet4_range"),
    );
  });
});
