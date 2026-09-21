// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import ConfigItemEditorModal from "./ConfigItemEditorModal.vue";

const createItemModal = () =>
  reactive({
    show: true,
    title: "编辑 DNS 服务器",
    mode: "visual",
    itemType: "dns_server",
    itemData: {
      tag: "local",
      type: "local",
      server: "",
      detour: "",
      client_subnet: "",
      inet4_range: "",
      inet6_range: "",
    },
    tempFields: {},
    routeRuleLogic: "or",
    jsonText: "",
    error: "",
    validating: false,
  });

describe("ConfigItemEditorModal", () => {
  const mountModal = () =>
    mount(ConfigItemEditorModal, {
      props: {
        itemModal: createItemModal(),
        configData: { dns: { servers: [] } },
        allOutboundTags: ["direct"],
        browserPresets: [],
        isLinux: true,
        isApplePlatform: false,
        isWindowsPlatform: false,
        processNamePlaceholder: "进程名",
        processPathPlaceholder: "进程路径",
        presetUrlSelectConfig: "http://cp.cloudflare.com/generate_204",
        getAddressPlaceholder: () => "服务器地址",
      },
    });

  it("renders the modal and emits mode changes", async () => {
    const wrapper = mountModal();

    expect(wrapper.text()).toContain("编辑 DNS 服务器");
    const jsonButton = wrapper
      .findAll("button")
      .find((button) => button.text() === "JSON 源码");
    await jsonButton.trigger("click");

    expect(wrapper.emitted("set-mode")).toEqual([["json"]]);
  });

  it("emits close and save actions", async () => {
    const wrapper = mountModal();

    await wrapper.get(".modal-header svg").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);

    const saveButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("保存"));
    await saveButton.trigger("click");
    expect(wrapper.emitted("save")).toHaveLength(1);
  });

  it("adds safe private bypass presets for a TUN inbound", async () => {
    const itemModal = createItemModal();
    itemModal.itemType = "inbound";
    itemModal.itemData = {
      type: "tun",
      address: ["172.19.0.1/30"],
      dns_address: ["172.19.0.2"],
      route_exclude_address: [],
    };
    const wrapper = mount(ConfigItemEditorModal, {
      props: {
        itemModal,
        configData: { dns: { servers: [] } },
        allOutboundTags: ["direct"],
        browserPresets: [],
        isLinux: false,
        isApplePlatform: false,
        isWindowsPlatform: true,
        processNamePlaceholder: "进程名",
        processPathPlaceholder: "进程路径",
        presetUrlSelectConfig: "",
        getAddressPlaceholder: () => "服务器地址",
      },
    });

    await wrapper.findAll("button").find((button) => button.text().includes("添加常用内网")).trigger("click");

    expect(itemModal.itemData.route_exclude_address).toEqual([
      "10.0.0.0/8",
      "192.168.0.0/16",
      "100.64.0.0/10",
      "169.254.0.0/16",
    ]);
  });

  it("edits a direct outbound network interface binding", async () => {
    const itemModal = createItemModal();
    itemModal.itemType = "outbound";
    itemModal.itemData = { tag: "direct", type: "direct" };
    const wrapper = mount(ConfigItemEditorModal, {
      props: { itemModal, configData: { dns: { servers: [] } }, allOutboundTags: [], browserPresets: [], isLinux: false, isApplePlatform: false, isWindowsPlatform: true, processNamePlaceholder: "", processPathPlaceholder: "", presetUrlSelectConfig: "", getAddressPlaceholder: () => "" },
    });

    const input = wrapper.find('input[placeholder="例如: Ethernet"]');
    await input.setValue("Ethernet");
    expect(itemModal.itemData.bind_interface).toBe("Ethernet");
  });
});
