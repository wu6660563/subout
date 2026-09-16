// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ProxyOutboundConfigEditor from "./ProxyOutboundConfigEditor.vue";

describe("ProxyOutboundConfigEditor", () => {
  it("renders proxy details and emits management actions", async () => {
    const proxy = {
      tag: "node-a",
      type: "vmess",
      server: "proxy.example.com",
      port: 443,
      uuid: "12345678-1234-1234-1234-123456789abc",
      tls: { enabled: true, server_name: "proxy.example.com", insecure: true },
      transport: { type: "ws" },
    };
    const wrapper = mount(ProxyOutboundConfigEditor, {
      props: {
        configData: { outbounds: [proxy] },
        proxyOutbounds: [proxy],
        selectedProxyTags: [],
        isAllProxiesSelected: false,
      },
    });

    expect(wrapper.text()).toContain("代理节点");
    expect(wrapper.text()).toContain("VMess 代理");
    expect(wrapper.text()).toContain("proxy.example.com");
    expect(wrapper.text()).toContain("跳过验证");

    await wrapper.find("input[type='checkbox']").setValue(true);
    expect(wrapper.emitted("toggle-proxy-selection")).toEqual([
      ["node-a", true],
    ]);

    const buttons = wrapper.findAll("button");
    await buttons.find((button) => button.text().includes("从节点池导入")).trigger("click");
    expect(wrapper.emitted("open-node-pool-import")).toHaveLength(1);
    await buttons.find((button) => button.text().includes("添加代理节点")).trigger("click");
    expect(wrapper.emitted("add-proxy-outbound")).toHaveLength(1);
    await buttons.find((button) => button.text() === "编辑").trigger("click");
    expect(wrapper.emitted("edit-item")).toEqual([[proxy]]);
    await buttons.find((button) => button.text() === "删除").trigger("click");
    expect(wrapper.emitted("remove-outbound")).toEqual([[0]]);
  });

  it("renders an empty state when no proxy nodes exist", () => {
    const wrapper = mount(ProxyOutboundConfigEditor, {
      props: { configData: { outbounds: [] }, proxyOutbounds: [] },
    });

    expect(wrapper.text()).toContain("暂无代理节点");
  });
});
