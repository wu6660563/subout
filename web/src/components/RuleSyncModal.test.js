// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import RuleSyncModal from "./RuleSyncModal.vue";

const createModal = () =>
  reactive({
    show: true,
    direction: "route_to_dns",
    sourceRule: { domain: ["example.com"], server: "local-dns" },
    sourceIndex: 0,
    mode: "new",
    targetIndex: -1,
    targetDnsServer: "local-dns",
    targetClientSubnet: "",
    targetRouteAction: "route",
    targetRouteOutbound: "direct",
    error: "",
  });

describe("RuleSyncModal", () => {
  const mountModal = () =>
    mount(RuleSyncModal, {
      props: {
        ruleSyncModal: createModal(),
        configData: {
          dns: {
            rules: [{ domain: ["example.com"], server: "local-dns" }],
            servers: [{ tag: "local-dns" }],
          },
          route: {
            rules: [{ domain: ["example.com"], action: "route", outbound: "direct" }],
          },
        },
        allOutboundTags: ["direct"],
        getRuleSummaryText: () => "example.com → local-dns",
      },
    });

  it("renders the source rule and emits confirmation", async () => {
    const wrapper = mountModal();

    expect(wrapper.text()).toContain("同步规则");
    expect(wrapper.text()).toContain("example.com → local-dns");

    const confirmButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("确认同步"));
    await confirmButton.trigger("click");
    expect(wrapper.emitted("confirm-sync")).toHaveLength(1);
  });

  it("emits close from the header", async () => {
    const wrapper = mountModal();

    await wrapper.get(".modal-header svg").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
