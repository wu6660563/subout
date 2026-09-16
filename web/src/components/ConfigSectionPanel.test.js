// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ConfigSectionPanel from "./ConfigSectionPanel.vue";

describe("ConfigSectionPanel", () => {
  it("renders the active section and forwards mode and visual actions", async () => {
    const configData = { outbounds: [{ tag: "direct", type: "direct" }] };
    const wrapper = mount(ConfigSectionPanel, {
      props: {
        active: true,
        section: "outbounds",
        mode: "visual",
        rawJson: { outbounds: "{}" },
        configData,
        allOutboundTags: ["direct"],
        basicOutbounds: configData.outbounds,
        groupOutbounds: [],
        selectedGroupTags: [],
        isAllOutboundGroupsSelected: false,
        proxyOutbounds: [],
        selectedProxyTags: [],
        isAllProxiesSelected: false,
        editItem: () => {},
        duplicateCheckFn: () => false,
      },
    });

    expect(wrapper.find(".panel").exists()).toBe(true);
    expect(wrapper.text()).toContain("outbounds 配置");
    expect(wrapper.text()).toContain("配置指南");

    await wrapper.find("button.btn-toggle").trigger("click");
    expect(wrapper.emitted("set-mode")).toEqual([["visual"]]);

    await wrapper.findAll("button").find((button) => button.text().includes("添加基础出站")).trigger("click");
    expect(wrapper.emitted("add-basic-outbound")).toHaveLength(1);
  });

  it("does not render an inactive section", () => {
    const wrapper = mount(ConfigSectionPanel, {
      props: {
        active: false,
        section: "log",
        mode: "visual",
        rawJson: { log: "{}" },
        configData: {},
        editItem: () => {},
        duplicateCheckFn: () => false,
      },
    });

    expect(wrapper.find(".panel").exists()).toBe(false);
  });
});
