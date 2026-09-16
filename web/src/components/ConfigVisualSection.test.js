// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ConfigVisualSection from "./ConfigVisualSection.vue";

describe("ConfigVisualSection", () => {
  it("renders the active visual section and forwards child actions", async () => {
    const configData = { outbounds: [{ tag: "direct", type: "direct" }] };
    const wrapper = mount(ConfigVisualSection, {
      props: {
        section: "outbounds",
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

    expect(wrapper.text()).toContain("配置指南");
    expect(wrapper.text()).toContain("基础出站连接");

    await wrapper.find("button").trigger("click");
    expect(wrapper.emitted("add-basic-outbound")).toHaveLength(1);
  });
});
