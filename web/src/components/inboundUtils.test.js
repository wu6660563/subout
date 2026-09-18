import { describe, expect, it } from "vitest";
import { normalizeInboundForType } from "./inboundUtils.js";

describe("inboundUtils", () => {
  it("applies tun defaults and removes incompatible fields", () => {
    expect(
      normalizeInboundForType(
        {
          type: "tun",
          address: [" 10.0.0.1/24 ", "", "fd00::2/126"],
          listen: "127.0.0.1",
          listen_port: 8080,
          auto_route: false,
          auto_redirect: true,
        },
        { isLinux: true, isApplePlatform: false, isWindowsPlatform: false },
      ),
    ).toEqual({
      type: "tun",
      address: [" 10.0.0.1/24 ", "fd00::2/126"],
      interface_name: "tun0",
      stack: "gvisor",
      auto_route: false,
      auto_redirect: true,
    });
  });

  it("adds both address families and clears auto_redirect on non-linux", () => {
    expect(
      normalizeInboundForType(
        { type: "tun", address: [], interface_name: "old" },
        { isLinux: false, isApplePlatform: false, isWindowsPlatform: true },
      ),
    ).toMatchObject({
      address: ["172.19.0.1/30", "fd00::1/126"],
      interface_name: "",
    });
    expect(
      normalizeInboundForType(
        { type: "tun", address: [], interface_name: "old", auto_redirect: true },
        { isLinux: false, isApplePlatform: false, isWindowsPlatform: true },
      ),
    ).not.toHaveProperty("auto_redirect");
  });

  it("normalizes TUN route exclusion CIDRs and removes them from socket inbounds", () => {
    expect(
      normalizeInboundForType(
        {
          type: "tun",
          address: ["172.19.0.1/30"],
          route_exclude_address: [" 10.16.228.100/32 ", "", "10.16.0.0/12"],
        },
        { isLinux: false, isApplePlatform: false, isWindowsPlatform: true },
      ),
    ).toMatchObject({
      route_exclude_address: ["10.16.228.100/32", "10.16.0.0/12"],
    });

    expect(
      normalizeInboundForType(
        { type: "http", route_exclude_address: ["10.16.228.100/32"] },
        { isLinux: true, isApplePlatform: false, isWindowsPlatform: false },
      ),
    ).not.toHaveProperty("route_exclude_address");
  });

  it("applies listen defaults for non-tun inbounds", () => {
    expect(
      normalizeInboundForType(
        {
          type: "http",
          interface_name: "eth0",
          stack: "gvisor",
          auto_route: true,
          strict_route: true,
          mtu: 1500,
          auto_redirect: true,
        },
        { isLinux: true, isApplePlatform: false, isWindowsPlatform: false },
      ),
    ).toEqual({ type: "http", listen: "::", listen_port: 2334 });
  });
});
