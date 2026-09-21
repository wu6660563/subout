import { describe, expect, it } from "vitest";
import { simulateDnsRoute, simulateRoute, simulateTunCapture } from "./routeSimulationUtils.js";

describe("routeSimulationUtils", () => {
  it("returns the first matching direct rule with the TUN process identity warning", () => {
    expect(simulateRoute({ domain: "gitlab.mtrcloud.cn", port: 443, network: "tcp" }, {
      route: { final: "proxy", rules: [
        { domain_suffix: ["mtrcloud.cn"], outbound: "direct" },
      ] },
    })).toMatchObject({
      matchedRuleIndex: 0,
      outbound: "direct",
      routeKind: "DIRECT",
      directNotice: expect.stringContaining("sing-box.exe"),
    });
  });

  it("falls back to route final when no rule matches", () => {
    const result = simulateRoute({ domain: "example.org", port: 443, network: "tcp" }, {
      route: { final: "proxy", rules: [{ domain: ["example.com"], outbound: "direct" }] },
    });
    expect(result).toMatchObject({ matchedRuleIndex: null, outbound: "proxy", routeKind: "PROXY" });
    expect(result.skippedRules).toEqual([{ index: 0, reasons: ["域名不匹配"] }]);
  });

  it("matches IP CIDR, domain keyword, and logical route rules", () => {
    const config = { route: { final: "proxy", rules: [
      { ip_cidr: ["10.16.0.0/12"], outbound: "direct" },
      { type: "logical", mode: "and", rules: [{ domain_keyword: ["gitlab"] }, { port: [8443] }], outbound: "special" },
    ] } };
    expect(simulateRoute({ domain: "10.16.228.100", port: 443, network: "tcp" }, config)).toMatchObject({ outbound: "direct", matchedRuleIndex: 0 });
    expect(simulateRoute({ domain: "gitlab.mtrcloud.cn", port: 8443, network: "tcp" }, config)).toMatchObject({ outbound: "special", matchedRuleIndex: 1 });
  });

  it("uses the supplied resolved IP for IP-based route rules", () => {
    const result = simulateRoute(
      { domain: "gitlab.example", resolvedIp: "10.16.228.100", port: 443, network: "tcp" },
      { route: { final: "proxy", rules: [{ ip_cidr: ["10.16.0.0/12"], outbound: "direct" }] } },
    );

    expect(result).toMatchObject({ matchedRuleIndex: 0, outbound: "direct" });
  });

  it("selects the first matching DNS rule server and falls back to DNS final", () => {
    const config = { dns: { final: "dns-foreign", rules: [
      { domain_suffix: ["mtrcloud.cn"], server: "dns-local" },
    ] } };
    expect(simulateDnsRoute("gitlab.mtrcloud.cn", config)).toEqual({ matchedRuleIndex: 0, server: "dns-local" });
    expect(simulateDnsRoute("example.org", config)).toEqual({ matchedRuleIndex: null, server: "dns-foreign" });
  });

  it("matches domain regex and process name while flagging rule-set limits", () => {
    const result = simulateRoute(
      { domain: "api.mtrcloud.cn", port: 443, network: "tcp", processName: "msedge.exe" },
      { route: { final: "proxy", rules: [
        { domain_regex: ["^api\\..+"], process_name: ["msedge.exe"], outbound: "direct", rule_set: ["geosite-cn"] },
      ] } },
    );
    expect(result).toMatchObject({ outbound: "direct", matchedRuleIndex: 0 });
    expect(result.limitations).toContain("rule_set");
  });

  it("matches process path, port range, and private IP rules", () => {
    const config = { route: { final: "proxy", rules: [
      { process_path: ["C:/Program Files/SDC/browser.exe"], port_range: ["8000:9000"], outbound: "direct" },
      { ip_is_private: true, outbound: "lan" },
    ] } };
    expect(simulateRoute({ domain: "service.example", port: 8443, network: "tcp", processPath: "C:/Program Files/SDC/browser.exe" }, config)).toMatchObject({ outbound: "direct" });
    expect(simulateRoute({ domain: "10.16.228.100", port: 443, network: "tcp" }, config)).toMatchObject({ outbound: "lan", matchedRuleIndex: 1 });
  });

  it("matches IP version and process path regex", () => {
    const config = { route: { final: "proxy", rules: [
      { ip_version: 6, outbound: "ipv6" },
      { process_path_regex: ["^C:/Program Files/SDC/.+\\.exe$"], outbound: "sdc" },
    ] } };
    expect(simulateRoute({ domain: "2001:db8::1", port: 443, network: "tcp" }, config)).toMatchObject({ outbound: "ipv6", matchedRuleIndex: 0 });
    expect(simulateRoute({ domain: "example.org", port: 443, network: "tcp", processPath: "C:/Program Files/SDC/browser.exe" }, config)).toMatchObject({ outbound: "sdc", matchedRuleIndex: 1 });
  });

  it("identifies an IP explicitly bypassed from TUN capture", () => {
    expect(simulateTunCapture({ domain: "10.16.228.100" }, {
      inbounds: [{ type: "tun", auto_route: true, route_exclude_address: ["10.16.0.0/12"] }],
    })).toEqual({
      status: "BYPASSED",
      message: "目标 IP 命中绕过地址 10.16.0.0/12，不会进入 TUN；SDC 可看到原始浏览器/沙箱进程。",
    });
  });

  it("explains when a domain needs DNS resolution before TUN capture can be decided", () => {
    expect(simulateTunCapture({ domain: "gitlab.mtrcloud.cn" }, {
      inbounds: [{ type: "tun", auto_route: true }],
    })).toEqual({
      status: "NEEDS_RESOLUTION",
      message: "域名需先解析为 IP，才能判断是否命中 TUN 接管或绕过网段。",
    });
  });

  it("uses a supplied resolved IP to decide TUN capture for a domain", () => {
    expect(simulateTunCapture({ domain: "gitlab.mtrcloud.cn", resolvedIp: "10.16.228.100" }, {
      inbounds: [{ type: "tun", auto_route: true, route_exclude_address: ["10.16.0.0/12"] }],
    })).toEqual({
      status: "BYPASSED",
      message: "目标 IP 命中绕过地址 10.16.0.0/12，不会进入 TUN；SDC 可看到原始浏览器/沙箱进程。",
    });
  });

  it("matches IPv6 TUN bypass addresses", () => {
    expect(simulateTunCapture({ domain: "corp.example", resolvedIp: "fd00:1234::20" }, {
      inbounds: [{ type: "tun", auto_route: true, route_exclude_address: ["fd00:1234::/48"] }],
    })).toMatchObject({ status: "BYPASSED" });
  });
});
