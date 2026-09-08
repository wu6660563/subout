// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

const state = vi.hoisted(() => {
  const { reactive, ref } = require("vue");
  return {
    token: ref("test-token"),
    appMode: ref("simple"),
    modeInitialized: ref(true),
    serviceStatus: ref({ conflicting_processes: [] }),
    systemModeInfo: ref({ os: "windows" }),
    toast: reactive({ show: false, type: "success", message: "" }),
    dialog: reactive({ show: false, type: "confirm" }),
    sessionSudoPassword: ref(""),
  };
});

vi.mock("./store.js", () => ({
  ...state,
  API_BASE: "",
  PUBLIC_ACCESS_TOKEN: "public-access",
  showToast: vi.fn(),
  logout: vi.fn(),
  fetchSystemMode: vi.fn(),
  fetchKernelInfo: vi.fn(),
  fetchServiceStatus: vi.fn(),
  confirmDialog: vi.fn(),
  promptDialog: vi.fn(),
  setSessionSudoPassword: vi.fn(),
  killExternalProcess: vi.fn(),
  takeoverService: vi.fn(),
}));

vi.mock("./validator.js", () => ({ initAjv: vi.fn() }));

vi.mock("./components/DashboardView.vue", () => ({
  default: { template: "<div>DashboardView</div>" },
}));
vi.mock("./components/SubscriptionsView.vue", () => ({
  default: { template: "<div>SubscriptionsView</div>" },
}));
vi.mock("./components/NodesView.vue", () => ({
  default: { template: "<div>NodesView</div>" },
}));
vi.mock("./components/GroupsView.vue", () => ({
  default: { template: "<div>GroupsView</div>" },
}));
vi.mock("./components/ConfigEditorView.vue", () => ({
  default: { template: "<div>ConfigEditorView</div>" },
}));
vi.mock("./components/SiteTestView.vue", () => ({
  default: { template: "<div>SiteTestView</div>" },
}));
vi.mock("./components/SimpleConfigView.vue", () => ({
  default: { template: "<div>SimpleConfigView</div>" },
}));
vi.mock("./components/ServiceLogsView.vue", () => ({
  default: { template: "<div>ServiceLogsView</div>" },
}));
vi.mock("./components/ModeSelectModal.vue", () => ({
  default: { template: "<div>ModeSelectModal</div>" },
}));
vi.mock("./components/SettingsView.vue", () => ({
  default: { template: "<div>SettingsView</div>" },
}));
vi.mock("./components/LoginBackground.vue", () => ({
  default: { template: "<div>LoginBackground</div>" },
}));
vi.mock("./components/HelpView.vue", () => ({
  default: { template: '<div data-test="help-view">HelpView</div>' },
}));

describe("App help navigation", () => {
  it("shows the help entry in both modes and routes #help to the help page", async () => {
    window.matchMedia = vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    window.location.hash = "#help";
    const { default: App } = await import("./App.vue");

    state.appMode.value = "simple";
    const simpleWrapper = mount(App);
    await flushPromises();
    expect(simpleWrapper.get('a[href="#help"]').text()).toContain("使用说明");
    expect(simpleWrapper.get('[data-test="help-view"]').exists()).toBe(true);
    simpleWrapper.unmount();

    state.appMode.value = "expert";
    const expertWrapper = mount(App);
    await flushPromises();
    expect(expertWrapper.get('a[href="#help"]').text()).toContain("使用说明");
    expect(expertWrapper.get('[data-test="help-view"]').exists()).toBe(true);
    expertWrapper.unmount();
  });
});
