import { describe, expect, it } from "vitest";
import {
  getAddressExample,
  getAddressPlaceholder,
  normalizeDnsServerForType,
} from "./dnsServerUtils.js";

describe("DNS server utilities", () => {
  it("returns examples for supported DNS server types", () => {
    expect(getAddressExample("udp")).toBe("223.5.5.5");
    expect(getAddressExample("https")).toBe("https://223.5.5.5/dns-query");
    expect(getAddressExample("quic")).toBe("quic://dns.adguard-dns.com");
    expect(getAddressExample("unknown")).toBe("");
  });

  it("returns contextual address placeholders", () => {
    expect(getAddressPlaceholder("tls")).toContain("dns.google");
    expect(getAddressPlaceholder("local")).toContain("无需配置地址");
    expect(getAddressPlaceholder("fakeip")).toContain("无需地址");
    expect(getAddressPlaceholder("unknown")).toBe("请输入服务器地址");
  });

  it("clears address fields for local dns servers", () => {
    const source = {
      type: "local",
      server: "old",
      detour: "proxy",
      inet4_range: "198.18.0.0/15",
      inet6_range: "fc00::/18",
    };

    expect(normalizeDnsServerForType(source)).toEqual({
      type: "local",
    });
    expect(source.server).toBe("old");
  });

  it("adds fakeip defaults and normal server examples", () => {
    expect(
      normalizeDnsServerForType({ type: "fakeip", server: "old" }),
    ).toEqual({
      type: "fakeip",
      inet4_range: "198.18.0.0/15",
      inet6_range: "fc00::/18",
    });
    expect(normalizeDnsServerForType({ type: "udp", inet4_range: "old" })).toEqual({
      type: "udp",
      server: "223.5.5.5",
    });
  });
});
