// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import LogConfigEditor from "./LogConfigEditor.vue";

describe("LogConfigEditor", () => {
  it("renders and updates log configuration fields", async () => {
    const configData = reactive({
      log: {
        level: "info",
        output: "",
        timestamp: true,
        disabled: false,
      },
    });
    const wrapper = mount(LogConfigEditor, {
      props: { configData },
    });

    expect(wrapper.text()).toContain("日志级别");
    await wrapper.get("select").setValue("debug");
    await wrapper.findAll("input").at(0).setValue("/tmp/sing-box.log");

    expect(configData.log.level).toBe("debug");
    expect(configData.log.output).toBe("/tmp/sing-box.log");
  });
});
