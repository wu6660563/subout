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

    const textarea = wrapper.find("textarea");
    textarea.element.value = [" 10.16.228.100/32 ", "10.16.0.0/12, "].join("\n");
    await textarea.trigger("input");

    expect(textarea.element.value).toBe(" 10.16.228.100/32 \n10.16.0.0/12, ");

    await textarea.trigger("blur");

    expect(configData.inbounds[0].route_exclude_address).toEqual([
      "10.16.228.100/32",
      "10.16.0.0/12",
    ]);
  });
});
