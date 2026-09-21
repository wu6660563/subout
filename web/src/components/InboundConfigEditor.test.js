// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import InboundConfigEditor from "./InboundConfigEditor.vue";

describe("InboundConfigEditor", () => {
  it("renders inbound rows and emits editor actions", async () => {
    const configData = reactive({
      inbounds: [
        {
          tag: "mixed-in",
          type: "mixed",
          listen: "127.0.0.1",
          listen_port: 2080,
        },
      ],
    });
    const wrapper = mount(InboundConfigEditor, {
      props: {
        configData,
        isLinux: true,
        isApplePlatform: false,
        isWindowsPlatform: false,
      },
    });

    expect(wrapper.find("input").element.value).toBe("mixed-in");
    await wrapper.findAll("button").find((button) => button.text().includes("添加入站")).trigger("click");
    expect(wrapper.emitted("add-inbound")).toHaveLength(1);

    await wrapper.findAll("button").find((button) => button.text() === "编辑").trigger("click");
    expect(wrapper.emitted("edit-item")).toEqual([[configData.inbounds[0], 0]]);
  });

  it("keeps TUN bypass separators while typing and normalizes them on blur", async () => {
    const configData = reactive({
      inbounds: [{ tag: "tun-in", type: "tun", route_exclude_address: [] }],
    });
    const wrapper = mount(InboundConfigEditor, {
      props: {
        configData,
        isLinux: false,
        isApplePlatform: false,
        isWindowsPlatform: true,
      },
    });

    const textarea = wrapper.findAll("textarea")[1];
    textarea.element.value = [" 10.16.228.100/32 ", "10.16.0.0/12, "].join("\n");
    await textarea.trigger("input");

    expect(textarea.element.value).toBe(" 10.16.228.100/32 \n10.16.0.0/12, ");

    await textarea.trigger("blur");

    expect(configData.inbounds[0].route_exclude_address).toEqual([
      "10.16.228.100/32",
      "10.16.0.0/12",
    ]);
  });

  it("edits TUN capture and DNS addresses without normalizing while typing", async () => {
    const configData = reactive({
      inbounds: [{ tag: "tun-in", type: "tun", route_address: [], dns_address: [] }],
    });
    const wrapper = mount(InboundConfigEditor, {
      props: {
        configData,
        isLinux: false,
        isApplePlatform: false,
        isWindowsPlatform: true,
      },
    });

    const textareas = wrapper.findAll("textarea");
    expect(textareas).toHaveLength(3);

    textareas[0].element.value = " 203.0.113.0/24, ";
    await textareas[0].trigger("input");
    expect(textareas[0].element.value).toBe(" 203.0.113.0/24, ");
    await textareas[0].trigger("blur");
    expect(configData.inbounds[0].route_address).toEqual(["203.0.113.0/24"]);

    textareas[2].element.value = " 172.19.0.2\nfd00::2 ";
    await textareas[2].trigger("input");
    await textareas[2].trigger("blur");
    expect(configData.inbounds[0].dns_address).toEqual(["172.19.0.2", "fd00::2"]);
  });

  it("adds safe private bypass presets without routing the TUN subnet away", async () => {
    const configData = reactive({
      inbounds: [
        {
          tag: "tun-in",
          type: "tun",
          address: ["172.19.0.1/30"],
          dns_address: ["172.19.0.2"],
          route_exclude_address: [],
        },
      ],
    });
    const wrapper = mount(InboundConfigEditor, {
      props: {
        configData,
        isLinux: false,
        isApplePlatform: false,
        isWindowsPlatform: true,
      },
    });

    await wrapper.findAll("button").find((button) => button.text().includes("添加常用内网")).trigger("click");

    expect(configData.inbounds[0].route_exclude_address).toEqual([
      "10.0.0.0/8",
      "192.168.0.0/16",
      "100.64.0.0/10",
      "169.254.0.0/16",
    ]);
  });
});
