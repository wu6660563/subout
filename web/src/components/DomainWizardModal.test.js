// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import DomainWizardModal from "./DomainWizardModal.vue";

const createModalState = (overrides = {}) =>
  reactive({
    show: true,
    inputText: "",
    errorMsg: "",
    detectedType: "",
    testUrl: "",
    extractedSuffix: "",
    isTesting: false,
    testProgress: 0,
    testTotal: 0,
    testLogs: [],
    testResults: {},
    recommendedOutbound: "",
    selectedOutbound: "",
    targetRuleAction: "create",
    ...overrides,
  });

describe("DomainWizardModal", () => {
  it("updates input and renders available outbound recommendations", async () => {
    const state = createModalState({
      inputText: "example.com",
      detectedType: "precise",
      testUrl: "example.com",
      testResults: { proxy: 120 },
      selectedOutbound: "proxy",
    });
    const wrapper = mount(DomainWizardModal, {
      props: {
        domainWizardModal: state,
        sortedOutboundsForSelect: [
          { tag: "proxy", latencyText: "120ms", isRecommended: true },
        ],
        matchingExistingRule: false,
      },
    });

    expect(wrapper.text()).toContain("example.com");
    expect(wrapper.text()).toContain("🔥 [系统推荐] proxy (120ms)");

    await wrapper.get("textarea").setValue("www.example.com");
    expect(state.inputText).toBe("www.example.com");
  });

  it("emits actions for latency testing, confirmation, and closing", async () => {
    const state = createModalState({
      inputText: "example.com",
      selectedOutbound: "proxy",
    });
    const wrapper = mount(DomainWizardModal, {
      props: {
        domainWizardModal: state,
        sortedOutboundsForSelect: [],
        matchingExistingRule: false,
      },
    });

    await wrapper.get("button.btn-primary").trigger("click");
    expect(wrapper.emitted("start-latency-test")).toHaveLength(1);

    const confirmButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("确认并写入配置"));
    await confirmButton.trigger("click");
    expect(wrapper.emitted("confirm-apply")).toHaveLength(1);

    const cancelButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("取消"));
    await cancelButton.trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
