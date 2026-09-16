// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import ConfigSectionModeEditor from "./ConfigSectionModeEditor.vue";

describe("ConfigSectionModeEditor", () => {
  it("renders section controls and emits mode changes", async () => {
    const rawJson = reactive({ dns: '{"servers":[]}' });
    const wrapper = mount(ConfigSectionModeEditor, {
      props: {
        section: "dns",
        mode: "json",
        rawJson,
      },
    });

    expect(wrapper.text()).toContain("dns 配置");
    expect(wrapper.get("textarea").element.value).toBe('{"servers":[]}');

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "可视化")
      .trigger("click");
    expect(wrapper.emitted("set-mode")).toEqual([["visual"]]);

    await wrapper.get("textarea").setValue('{"servers":[{"tag":"local"}]}');
    expect(rawJson.dns).toBe('{"servers":[{"tag":"local"}]}');
  });
});
