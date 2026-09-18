import { describe, expect, it } from "vitest";
import {
  RETENTION_OPTIONS,
  filterAuditEvents,
  formatMatchedRule,
  normalizeAuditResponse,
  sortAuditEvents,
} from "./connectionAuditUtils.js";

const events = [
  {
    first_seen: 100,
    last_seen: 120,
    pid: 10,
    process_name: "Chrome.exe",
    process_path: "C:/Chrome.exe",
    target: { type: "Domain", value: "example.com" },
    target_display: "example.com",
    port: 443,
    protocol: "TCP",
    route_kind: "PROXY",
    final_node: "HK-02",
    outbound_chain: ["proxy", "HK-02"],
  },
  {
    first_seen: 90,
    last_seen: 110,
    pid: 20,
    process_name: "curl",
    process_path: "/usr/bin/curl",
    target: { type: "Ip", value: "1.2.3.4" },
    target_display: "1.2.3.4",
    port: 80,
    protocol: "TCP",
    route_kind: "DIRECT",
    final_node: null,
    outbound_chain: [],
  },
];

describe("connection audit utilities", () => {
  it("normalizes object and legacy array responses", () => {
    expect(normalizeAuditResponse({ events, retention_minutes: 20 })).toEqual({
      events: [events[0]],
      current: [events[0]],
      retentionMinutes: 20,
      recordingEnabled: true,
      health: null,
    });
    expect(normalizeAuditResponse(events).events).toEqual([events[0]]);
    expect(normalizeAuditResponse(events).current).toEqual([events[0]]);
    expect(normalizeAuditResponse({ events, recording_enabled: false }).recordingEnabled).toBe(false);
  });

  it("uses exactly the supported retention options", () => {
    expect(RETENTION_OPTIONS).toEqual([10, 20]);
  });

  it("excludes direct events and filters by process, target, route, protocol and node", () => {
    expect(filterAuditEvents(events, {}).map((event) => event.pid)).toEqual([10]);
    expect(filterAuditEvents(events, { process: "curl" })).toHaveLength(0);
    expect(filterAuditEvents(events, { target: "EXAMPLE.COM" })).toHaveLength(1);
    expect(filterAuditEvents(events, { route: "DIRECT" })).toHaveLength(0);
    expect(filterAuditEvents(events, { protocol: "UDP" })).toHaveLength(0);
    expect(filterAuditEvents(events, { node: "hk-02" })).toHaveLength(1);
  });

  it("sorts by last seen, process and node", () => {
    expect(sortAuditEvents(events, "last_seen", "asc").map((event) => event.pid)).toEqual([20, 10]);
    expect(sortAuditEvents(events, "process", "asc").map((event) => event.pid)).toEqual([10, 20]);
    expect(sortAuditEvents(events, "node", "asc").map((event) => event.pid)).toEqual([20, 10]);
  });

  it("formats matched route rule details without inventing missing rules", () => {
    expect(formatMatchedRule({ matched_rule_index: 3, matched_rule_tag: "YouTube", matched_rule_summary: "tag=YouTube => proxy" }))
      .toBe("#3 · YouTube · tag=YouTube => proxy");
    expect(formatMatchedRule({})).toBe("规则未知");
  });
});
