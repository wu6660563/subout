import { describe, expect, it } from "vitest";
import { getTunRiskWarnings } from "./tunStatusUtils.js";

describe("tunStatusUtils", () => {
  it("warns when automatic TUN capture has no bypass routes", () => {
    expect(getTunRiskWarnings({ auto_route: true, route_address: ["0.0.0.0/0"] })).toEqual([
      "未配置绕过地址：被 TUN 接管的内网流量仍由 sing-box.exe 发起。若 SDC 依赖原进程身份放行，请将实际内网 CIDR 加入“绕过地址”。",
    ]);
  });

  it("warns about a hijacked DNS configuration without a TUN DNS address", () => {
    expect(getTunRiskWarnings({ auto_route: false, dns_mode: "hijack" })).toEqual([
      "DNS 接管已开启但未配置 TUN DNS 地址：DNS 将完全依赖 sing-box 的 DNS 规则，请确认企业域名能命中正确的 DNS 服务器。",
      "自动路由已关闭：请确认已由系统或外部工具下发了到 TUN 的路由，否则流量可能不会进入 sing-box。",
    ]);
  });

  it("does not raise route warnings when bypass and DNS settings are explicit", () => {
    expect(getTunRiskWarnings({
      auto_route: true,
      strict_route: true,
      dns_mode: "hijack",
      dns_address: ["172.19.0.2"],
      route_exclude_address: ["10.16.0.0/12"],
    })).toEqual([]);
  });
});
