import { describe, expect, it } from "vitest";
import { normalizeRouteRuleAction } from "./routeRuleUtils.js";

describe("routeRuleUtils", () => {
  it("removes outbound for non-route actions", () => {
    const source = { action: "reject", outbound: "proxy" };

    expect(normalizeRouteRuleAction(source, ["direct"])).toEqual({
      action: "reject",
    });
    expect(source.outbound).toBe("proxy");
  });

  it("selects an outbound for route actions", () => {
    expect(normalizeRouteRuleAction({ action: "route" }, ["proxy"])).toEqual({
      action: "route",
      outbound: "proxy",
    });
    expect(
      normalizeRouteRuleAction({ action: "route", outbound: "relay" }, ["proxy"]),
    ).toEqual({ action: "route", outbound: "relay" });
  });

  it("uses direct when no outbound is available", () => {
    expect(normalizeRouteRuleAction({ action: "" }, [])).toEqual({
      action: "",
      outbound: "direct",
    });
  });
});
