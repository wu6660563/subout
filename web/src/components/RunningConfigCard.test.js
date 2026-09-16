// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import RunningConfigCard from "./RunningConfigCard.vue";

describe("RunningConfigCard", () => {
  it("renders running state and emits open when settings is clicked", async () => {
    const wrapper = mount(RunningConfigCard, {
      props: {
        runningConfig: {
          config_id: 7,
          kernel_installed: true,
          kernel_version: "1.11.0",
          is_service_running: true,
        },
        runningConfigName: "生产配置",
      },
    });

    expect(wrapper.text()).toContain("#7 (生产配置)");
    expect(wrapper.text()).toContain("已就绪 (1.11.0)");
    expect(wrapper.text()).toContain("运行中");

    await wrapper.get("button").trigger("click");

    expect(wrapper.emitted("open-running-config-modal")).toHaveLength(1);
  });

  it("renders empty and stopped states", () => {
    const wrapper = mount(RunningConfigCard, {
      props: {
        runningConfig: {
          config_id: null,
          kernel_installed: false,
          kernel_version: null,
          is_service_running: false,
        },
      },
    });

    expect(wrapper.text()).toContain("未设定");
    expect(wrapper.text()).toContain("未安装");
    expect(wrapper.text()).toContain("已停止");
  });
});
