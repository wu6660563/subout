import { describe, expect, it } from "vitest";
import {
  getOutboundTags,
  getOutboundTypeBuckets,
  removeGroupsAndOrphanedProxyNodes,
  toggleSelectedTag,
} from "./outboundManagementUtils.js";

describe("outboundManagementUtils", () => {
  const outbounds = [
    { type: "direct", tag: "direct" },
    { type: "selector", tag: "group-a", outbounds: ["node-a", "node-shared"] },
    { type: "urltest", tag: "group-b", outbounds: ["node-shared"] },
    { type: "vless", tag: "node-a" },
    { type: "vmess", tag: "node-shared" },
  ];

  it("classifies outbounds and returns unique tags", () => {
    expect(getOutboundTags([...outbounds, { type: "trojan", tag: "node-a" }])).toEqual([
      "direct",
      "group-a",
      "group-b",
      "node-a",
      "node-shared",
    ]);
    expect(getOutboundTypeBuckets(outbounds)).toEqual({
      basic: [{ type: "direct", tag: "direct" }],
      groups: [outbounds[1], outbounds[2]],
      proxies: [outbounds[3], outbounds[4]],
    });
  });

  it("removes selected groups and only their orphaned proxy nodes", () => {
    const result = removeGroupsAndOrphanedProxyNodes(outbounds, ["group-a"]);

    expect(result.orphanedProxyCount).toBe(1);
    expect(result.outbounds.map((item) => item.tag)).toEqual([
      "direct",
      "group-b",
      "node-shared",
    ]);
  });

  it("toggles an individual tag without mutating the selection", () => {
    const selected = ["group-a"];

    expect(toggleSelectedTag(selected, "group-b", true)).toEqual([
      "group-a",
      "group-b",
    ]);
    expect(toggleSelectedTag(selected, "group-a", false)).toEqual([]);
    expect(selected).toEqual(["group-a"]);
  });
});
