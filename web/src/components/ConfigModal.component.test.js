// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick, reactive } from "vue";
import ConfigPreviewModal from "./ConfigPreviewModal.vue";
import RunningConfigModal from "./RunningConfigModal.vue";

describe("extracted config modal components", () => {
  it("renders the preview modal from its state prop", () => {
    const wrapper = mount(ConfigPreviewModal, {
      props: {
        previewModal: { show: true, loading: false, error: "", jsonObject: { log: {} } },
        copyPreviewToClipboard: vi.fn(),
        exportPreviewFile: vi.fn(),
      },
    });

    expect(wrapper.text()).toContain("预览生成完整配置");
    expect(wrapper.text()).toContain("关闭");
  });

  it("renders the running config form from its state props", () => {
    const wrapper = mount(RunningConfigModal, {
      props: {
        runningConfigModal: { show: true, viewMode: "form", saving: false },
        runningConfig: { kernel_installed: true },
        runningConfigForm: { config_id: null },
        configList: [],
        closeRunningConfigModal: vi.fn(),
        copyLogConsole: vi.fn(),
        saveRunningConfigSettings: vi.fn(),
      },
    });

    expect(wrapper.text()).toContain("运行设置");
    expect(wrapper.text()).toContain("更新");
  });

  it("scrolls the terminal to the newest log entry", async () => {
    const wrapper = mount(RunningConfigModal, {
      props: {
        runningConfigModal: {
          show: true,
          viewMode: "log",
          saving: false,
          status: "running",
          logs: [],
          commandOutput: "",
        },
        runningConfig: { kernel_installed: true },
        runningConfigForm: { config_id: null },
        configList: [],
        closeRunningConfigModal: vi.fn(),
        copyLogConsole: vi.fn(),
        saveRunningConfigSettings: vi.fn(),
      },
    });

    const terminal = wrapper.find(".terminal-body");
    Object.defineProperty(terminal.element, "scrollHeight", {
      value: 240,
      configurable: true,
    });

    await wrapper.setProps({
      runningConfigModal: {
        show: true,
        viewMode: "log",
        saving: false,
        status: "running",
        logs: [
          {
            timestamp: "12:00:00",
            step: "更新",
            status: "info",
            message: "新的日志",
          },
        ],
        commandOutput: "",
      },
    });
    await nextTick();

    expect(terminal.element.scrollTop).toBe(240);
  });

  it("scrolls after logs are replaced with the same number of entries", async () => {
    const runningConfigModal = reactive({
      show: true,
      viewMode: "log",
      saving: false,
      status: "running",
      logs: [
        {
          timestamp: "12:00:00",
          step: "初始化",
          status: "info",
          message: "短日志",
        },
      ],
      commandOutput: "",
    });
    const wrapper = mount(RunningConfigModal, {
      props: {
        runningConfigModal,
        runningConfig: { kernel_installed: true },
        runningConfigForm: { config_id: null },
        configList: [],
        closeRunningConfigModal: vi.fn(),
        copyLogConsole: vi.fn(),
        saveRunningConfigSettings: vi.fn(),
      },
    });

    const terminal = wrapper.find(".terminal-body");
    Object.defineProperty(terminal.element, "scrollHeight", {
      value: 360,
      configurable: true,
    });

    runningConfigModal.status = "success";
    runningConfigModal.logs = [
      {
        timestamp: "12:00:01",
        step: "完成",
        status: "success",
        message: "替换后的更长日志内容",
      },
    ];
    await nextTick();
    await nextTick();

    expect(terminal.element.scrollTop).toBe(360);
  });
});
