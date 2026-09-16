// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ConfigEditorHeader from "./ConfigEditorHeader.vue";

describe("ConfigEditorHeader", () => {
  it("renders edit actions and emits navigation events", async () => {
    const wrapper = mount(ConfigEditorHeader, {
      props: {
        currentConfigId: 3,
        currentConfigDetail: "测试配置",
        activeSection: "log",
        sections: ["log", "dns"],
        isCurrentConfigRunning: true,
        runningConfigModal: { saving: false },
        currentConfigName: "测试配置",
      },
    });

    expect(wrapper.text()).toContain("编辑中 #3");
    expect(wrapper.find("input.config-remark-input").element.value).toBe(
      "测试配置",
    );

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("返回列表"))
      .trigger("click");
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("保存配置"))
      .trigger("click");

    expect(wrapper.emitted("back")).toHaveLength(1);
    expect(wrapper.emitted("save")).toHaveLength(1);
  });

  it("emits active section and remark updates", async () => {
    const wrapper = mount(ConfigEditorHeader, {
      props: {
        currentConfigId: 1,
        currentConfigDetail: "旧名称",
        activeSection: "log",
        sections: ["log", "dns"],
        isCurrentConfigRunning: false,
        runningConfigModal: { saving: false },
        currentConfigName: "旧名称",
      },
    });

    await wrapper.find("input.config-remark-input").setValue("新名称");
    await wrapper
      .findAll(".tab")
      .find((tab) => tab.text() === "DNS服务")
      .trigger("click");

    expect(wrapper.emitted("update:current-config-detail")).toEqual([
      ["新名称"],
    ]);
    expect(wrapper.emitted("update:active-section")).toEqual([["dns"]]);
  });
});
