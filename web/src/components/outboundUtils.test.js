import { describe, expect, it } from "vitest";
import {
  getOutboundTypeDisplay,
  getProxyTypeDisplay,
  getProtocolBadgeClass,
  sanitizeOutboundItem,
} from "./outboundUtils.js";

describe("outbound utilities", () => {
  it("maps outbound and proxy types for display", () => {
    expect(getOutboundTypeDisplay("urltest")).toBe("自动测速 (URLTest)");
    expect(getProxyTypeDisplay("vmess")).toBe("VMess 代理");
    expect(getProtocolBadgeClass("trojan")).toBe("badge-success");
    expect(getProtocolBadgeClass("unknown")).toBe("badge");
  });

  it("removes TLS from outbound types that do not support it", () => {
    const item = { tag: "direct", type: "direct", tls: { enabled: true } };
    const sanitized = sanitizeOutboundItem(item);

    expect(sanitized).toEqual({ tag: "direct", type: "direct" });
    expect(item.tls).toEqual({ enabled: true });
    expect(sanitizeOutboundItem({ type: "vmess", tls: { enabled: true } })).toEqual({
      type: "vmess",
      tls: { enabled: true },
    });
  });
});
