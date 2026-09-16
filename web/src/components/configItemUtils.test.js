import { describe, expect, it } from "vitest";
import { getConfigItemList } from "./configItemUtils.js";

describe("configItemUtils", () => {
  const configData = {
    dns: { servers: ["server"], rules: ["dns-rule"] },
    inbounds: ["inbound"],
    outbounds: ["outbound"],
    route: { rules: ["route-rule"], rule_set: ["ruleset"] },
  };

  it("returns the list for every supported item type", () => {
    expect(getConfigItemList(configData, "dns_server")).toEqual(["server"]);
    expect(getConfigItemList(configData, "dns_rule")).toEqual(["dns-rule"]);
    expect(getConfigItemList(configData, "inbound")).toEqual(["inbound"]);
    expect(getConfigItemList(configData, "outbound")).toEqual(["outbound"]);
    expect(getConfigItemList(configData, "route_rule")).toEqual(["route-rule"]);
    expect(getConfigItemList(configData, "route_ruleset")).toEqual(["ruleset"]);
  });

  it("returns null for an unknown item type", () => {
    expect(getConfigItemList(configData, "unknown")).toBeNull();
  });
});
