// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../store.js", () => ({
  API_BASE: "",
  token: { value: "test-token" },
  showToast: vi.fn(),
  confirmDialog: vi.fn().mockResolvedValue(false),
}));

describe("ConnectionAuditView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn((url) => {
      if (String(url).includes("/settings")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ retention_minutes: 20, recording_enabled: true, options: [10, 20] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ retention_minutes: 20, events: [{ event_id: 1, first_seen: 100, last_seen: 101, occurrence_count: 3, pid: 7, process_name: "demo.exe", process_path: "C:/demo.exe", target: { type: "Domain", value: "example.com" }, target_display: "example.com", port: 443, protocol: "TCP", route_kind: "PROXY", final_node: "飞鸟云/HK-01", outbound_chain: ["proxy", "HK-01"] }] }) });
    });
  });

  it("renders proxy-default audit rows and retention controls", async () => {
    const { default: ConnectionAuditView } = await import("./ConnectionAuditView.vue");
    const wrapper = mount(ConnectionAuditView);
    await flushPromises();
    expect(wrapper.text()).toContain("demo.exe");
    expect(wrapper.text()).toContain("example.com:443/TCP");
    expect(wrapper.text()).toContain("飞鸟云/HK-01");
    expect(wrapper.find("select").exists()).toBe(true);
    expect(wrapper.findAll("option").map((option) => option.text())).toEqual(expect.arrayContaining(["10 分钟", "20 分钟"]));
    expect(wrapper.findAll("option").map((option) => option.text())).not.toContain("DIRECT");
    expect(wrapper.text()).not.toContain("显示直连");
    expect(wrapper.text()).toContain("记录连接审计日志");
    await wrapper.get("button.btn-link").trigger("click");
    expect(wrapper.text()).toContain("命中次数：3");
    expect(wrapper.text()).toContain("最近连接 ID：");
    wrapper.unmount();
  });

  it("labels a simulated direct result as sing-box initiated under TUN", async () => {
    global.fetch = vi.fn((url) => {
      if (String(url).includes("/settings")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ retention_minutes: 20, recording_enabled: true }) });
      if (String(url).includes("/config/generated")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ route: { final: "proxy", rules: [{ domain_suffix: ["mtrcloud.cn"], outbound: "direct" }] }, dns: { final: "dns-foreign", rules: [{ domain_suffix: ["mtrcloud.cn"], server: "dns-local" }] } }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ retention_minutes: 20, events: [] }) });
    });
    const { default: ConnectionAuditView } = await import("./ConnectionAuditView.vue");
    const wrapper = mount(ConnectionAuditView);
    await flushPromises();
    const inputs = wrapper.findAll(".audit-route-test input");
    await inputs[0].setValue("gitlab.mtrcloud.cn");
    await wrapper.findAll("button").find((button) => button.text() === "测试路由").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Direct（直连）");
    expect(wrapper.text()).toContain("sing-box.exe");
    expect(wrapper.text()).toContain("DNS 推演：命中 DNS 规则 #1 · DNS 服务器 dns-local");
    wrapper.unmount();
  });

  it("shows the generated TUN capture, DNS and route settings on demand", async () => {
    global.fetch = vi.fn((url) => {
      if (String(url).includes("/settings")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ retention_minutes: 20, recording_enabled: true }) });
      if (String(url).includes("/config/generated")) return Promise.resolve({ ok: true, json: () => Promise.resolve({
        inbounds: [{ tag: "tun-in", type: "tun", address: ["172.19.0.1/30"], dns_mode: "hijack", dns_address: ["172.19.0.2"], route_address: ["0.0.0.0/1"], route_exclude_address: ["10.16.0.0/12"], auto_route: true, strict_route: true }],
      }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ retention_minutes: 20, events: [] }) });
    });
    const { default: ConnectionAuditView } = await import("./ConnectionAuditView.vue");
    const wrapper = mount(ConnectionAuditView);
    await flushPromises();
    await wrapper.findAll("button").find((button) => button.text() === "查看 TUN 状态").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("当前 TUN 状态");
    expect(wrapper.text()).toContain("172.19.0.1/30");
    expect(wrapper.text()).toContain("hijack");
    expect(wrapper.text()).toContain("10.16.0.0/12");
    expect(wrapper.text()).toContain("严格路由：已开启");
    wrapper.unmount();
  });

  it("shows an actionable warning for automatic TUN capture without bypass routes", async () => {
    global.fetch = vi.fn((url) => {
      if (String(url).includes("/settings")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ retention_minutes: 20, recording_enabled: true }) });
      if (String(url).includes("/config/generated")) return Promise.resolve({ ok: true, json: () => Promise.resolve({
        inbounds: [{ type: "tun", auto_route: true, route_address: ["0.0.0.0/0"] }],
      }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ retention_minutes: 20, events: [] }) });
    });
    const { default: ConnectionAuditView } = await import("./ConnectionAuditView.vue");
    const wrapper = mount(ConnectionAuditView);
    await flushPromises();
    await wrapper.findAll("button").find((button) => button.text() === "查看 TUN 状态").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("配置提示");
    expect(wrapper.text()).toContain("若 SDC 依赖原进程身份放行");
    wrapper.unmount();
  });

  it("shows when an IP route test bypasses TUN and preserves the original process identity", async () => {
    global.fetch = vi.fn((url) => {
      if (String(url).includes("/settings")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ retention_minutes: 20, recording_enabled: true }) });
      if (String(url).includes("/config/generated")) return Promise.resolve({ ok: true, json: () => Promise.resolve({
        inbounds: [{ type: "tun", auto_route: true, route_exclude_address: ["10.16.0.0/12"] }],
        route: { final: "direct" },
      }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ retention_minutes: 20, events: [] }) });
    });
    const { default: ConnectionAuditView } = await import("./ConnectionAuditView.vue");
    const wrapper = mount(ConnectionAuditView);
    await flushPromises();
    await wrapper.findAll(".audit-route-test input")[0].setValue("10.16.228.100");
    await wrapper.findAll("button").find((button) => button.text() === "测试路由").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("TUN 接管判断：已绕过 TUN");
    expect(wrapper.text()).toContain("SDC 可看到原始浏览器/沙箱进程");
    wrapper.unmount();
  });

  it("uses a supplied resolved IP to show that a domain bypasses TUN", async () => {
    global.fetch = vi.fn((url) => {
      if (String(url).includes("/settings")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ retention_minutes: 20, recording_enabled: true }) });
      if (String(url).includes("/config/generated")) return Promise.resolve({ ok: true, json: () => Promise.resolve({
        inbounds: [{ type: "tun", auto_route: true, route_exclude_address: ["10.16.0.0/12"] }],
        route: { final: "direct" },
      }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ retention_minutes: 20, events: [] }) });
    });
    const { default: ConnectionAuditView } = await import("./ConnectionAuditView.vue");
    const wrapper = mount(ConnectionAuditView);
    await flushPromises();
    await wrapper.get('input[placeholder^="域名或 IP"]').setValue("gitlab.mtrcloud.cn");
    await wrapper.get('input[placeholder^="可选：解析后 IP"]').setValue("10.16.228.100");
    await wrapper.findAll("button").find((button) => button.text() === "测试路由").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("TUN 接管判断：已绕过 TUN");
    wrapper.unmount();
  });

  it("keeps expanded state isolated for route-change history rows", async () => {
    global.fetch = vi.fn((url) => {
      if (String(url).includes("/settings")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ retention_minutes: 20, recording_enabled: true, options: [10, 20] }) });
      }
      const base = { first_seen: 100, last_seen: 101, pid: 7, process_name: "demo.exe", process_path: "C:/demo.exe", target: { type: "Domain", value: "example.com" }, target_display: "example.com", port: 443, protocol: "TCP", route_kind: "PROXY" };
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ retention_minutes: 20, events: [
        { ...base, event_id: 1, connection_id: "old", final_node: "飞鸟云/HK-01", outbound_chain: ["proxy", "HK-01"] },
        { ...base, event_id: 2, first_seen: 90, connection_id: "new", final_node: "飞鸟云/HK-02", outbound_chain: ["proxy", "HK-02"] },
      ] }) });
    });
    const { default: ConnectionAuditView } = await import("./ConnectionAuditView.vue");
    const wrapper = mount(ConnectionAuditView);
    await flushPromises();
    const expandButtons = wrapper.findAll("button.audit-detail-toggle");
    expect(expandButtons).toHaveLength(2);
    await expandButtons[0].trigger("click");
    expect(wrapper.findAll(".audit-detail-row")).toHaveLength(1);
    await expandButtons[1].trigger("click");
    expect(wrapper.findAll(".audit-detail-row")).toHaveLength(2);
    wrapper.unmount();
  });

  it("keeps an expanded record open when polling updates its last observation", async () => {
    let auditRequestCount = 0;
    global.fetch = vi.fn((url) => {
      if (String(url).includes("/settings")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ retention_minutes: 20, recording_enabled: true, options: [10, 20] }) });
      }
      auditRequestCount += 1;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ retention_minutes: 20, events: [{
        event_id: 9,
        first_seen: 100,
        last_seen: 100 + auditRequestCount,
        pid: 7,
        process_name: "demo.exe",
        process_path: "C:/demo.exe",
        target: { type: "Domain", value: "example.com" },
        target_display: "example.com",
        port: 443,
        protocol: "TCP",
        route_kind: "PROXY",
        final_node: "飞鸟云/HK-01",
        outbound_chain: ["proxy", "HK-01"],
      }] }) });
    });
    const { default: ConnectionAuditView } = await import("./ConnectionAuditView.vue");
    const wrapper = mount(ConnectionAuditView);
    await flushPromises();
    await wrapper.get("button.audit-detail-toggle").trigger("click");
    expect(wrapper.findAll(".audit-detail-row")).toHaveLength(1);
    await wrapper.findAll("button").find((button) => button.text() === "刷新").trigger("click");
    await flushPromises();
    expect(wrapper.findAll(".audit-detail-row")).toHaveLength(1);
    expect(wrapper.get("button.audit-detail-toggle").text()).toBe("收起");
    wrapper.unmount();
  });

  it("does not start overlapping audit requests while a refresh is pending", async () => {
    let resolveAuditRequest;
    let auditRequests = 0;
    global.fetch = vi.fn((url) => {
      if (String(url).includes("/settings")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ retention_minutes: 20, recording_enabled: true, options: [10, 20] }) });
      }
      auditRequests += 1;
      return new Promise((resolve) => { resolveAuditRequest = resolve; });
    });
    const { default: ConnectionAuditView } = await import("./ConnectionAuditView.vue");
    const wrapper = mount(ConnectionAuditView);
    await flushPromises();
    const refresh = wrapper.findAll("button").find((button) => button.text() === "刷新");
    await refresh.trigger("click");
    await refresh.trigger("click");
    expect(auditRequests).toBe(1);
    resolveAuditRequest({ ok: true, json: () => Promise.resolve({ retention_minutes: 20, events: [] }) });
    await flushPromises();
    wrapper.unmount();
  });

  it("counts a route change as a new record and clears transient audit state", async () => {
    let auditRequests = 0;
    global.fetch = vi.fn((url) => {
      if (String(url).includes("/settings")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ retention_minutes: 20, recording_enabled: true, options: [10, 20] }) });
      }
      if (String(url).includes("/clear")) return Promise.resolve({ ok: true });
      auditRequests += 1;
      const base = { first_seen: 100, last_seen: 101, pid: 7, process_name: "demo.exe", process_path: "C:/demo.exe", target: { type: "Domain", value: "example.com" }, target_display: "example.com", port: 443, protocol: "TCP", route_kind: "PROXY" };
      const events = auditRequests === 1
        ? [{ ...base, event_id: 1, final_node: "飞鸟云/HK-01", outbound_chain: ["proxy", "HK-01"] }]
        : [{ ...base, event_id: 1, final_node: "飞鸟云/HK-01", outbound_chain: ["proxy", "HK-01"] }, { ...base, event_id: 2, final_node: "飞鸟云/JP-01", outbound_chain: ["proxy", "JP-01"] }];
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ retention_minutes: 20, health: { event_cap_reached: true }, events }) });
    });
    const { confirmDialog } = await import("../store.js");
    confirmDialog.mockResolvedValueOnce(true);
    const { default: ConnectionAuditView } = await import("./ConnectionAuditView.vue");
    const wrapper = mount(ConnectionAuditView);
    await flushPromises();
    wrapper.get(".audit-table-wrap").element.scrollTop = 100;
    await wrapper.get(".audit-table-wrap").trigger("scroll");
    await wrapper.findAll("button").find((button) => button.text() === "刷新").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("有 1 条新记录");
    await wrapper.get("button.audit-detail-toggle").trigger("click");
    expect(wrapper.findAll(".audit-detail-row")).toHaveLength(1);
    await wrapper.findAll("button").find((button) => button.text() === "清空日志").trigger("click");
    await flushPromises();
    expect(wrapper.findAll(".audit-detail-row")).toHaveLength(0);
    expect(wrapper.text()).toContain("暂无匹配的连接审计记录");
    expect(wrapper.text()).not.toContain("内存审计记录已达到上限");
    wrapper.unmount();
  });
});
