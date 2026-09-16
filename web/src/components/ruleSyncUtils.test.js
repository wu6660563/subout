import { describe, expect, it } from "vitest";
import {
  buildSyncedRule,
  getRuleSyncValidationError,
} from "./ruleSyncUtils.js";

describe("ruleSyncUtils", () => {
  it("builds a dns rule from a logical route rule", () => {
    const source = {
      type: "logical",
      mode: "and",
      invert: true,
      rules: [
        { domain_suffix: ["example.com"], ip_cidr: ["10.0.0.0/8"] },
        { process_name: ["curl"], geoip: ["private"] },
      ],
    };

    expect(
      buildSyncedRule(source, "route_to_dns", {
        targetDnsServer: "remote-dns",
        targetClientSubnet: "  192.168.1.0/24  ",
      }),
    ).toEqual({
      type: "logical",
      mode: "and",
      rules: [
        { domain_suffix: ["example.com"] },
        { process_name: ["curl"] },
      ],
      invert: true,
      server: "remote-dns",
      client_subnet: "192.168.1.0/24",
    });
  });

  it("builds a route rule and only adds outbound for route actions", () => {
    const source = {
      domain: ["example.com"],
      ip_is_private: true,
      action: "reject",
      outbound: "old",
    };

    expect(
      buildSyncedRule(source, "dns_to_route", {
        targetRouteAction: "route",
        targetRouteOutbound: "proxy",
      }),
    ).toEqual({
      domain: ["example.com"],
      ip_is_private: true,
      action: "route",
      outbound: "proxy",
    });

    expect(
      buildSyncedRule(source, "dns_to_route", {
        targetRouteAction: "block",
        targetRouteOutbound: "proxy",
      }).outbound,
    ).toBeUndefined();
  });

  it("uses the local dns fallback and does not mutate the source", () => {
    const source = { domain: ["example.com"] };
    const result = buildSyncedRule(source, "route_to_dns", {});

    expect(result).toEqual({
      domain: ["example.com"],
      server: "local-dns",
    });
    result.domain.push("changed");
    expect(source.domain).toEqual(["example.com"]);
  });

  it("validates required sync targets", () => {
    expect(
      getRuleSyncValidationError({
        direction: "dns_to_route",
        targetRouteAction: "route",
        targetRouteOutbound: "",
      }),
    ).toBe("请选择目标出站 Tag (outbound)");
    expect(
      getRuleSyncValidationError({
        direction: "route_to_dns",
        targetDnsServer: "",
      }),
    ).toBe("请选择目标 DNS 服务器 Tag (server)");
    expect(
      getRuleSyncValidationError({
        direction: "dns_to_route",
        targetRouteAction: "block",
        targetRouteOutbound: "",
      }),
    ).toBe("");
  });
});
