import { describe, expect, it } from "vitest";
import {
  getInitialActiveSection,
  parseConfigRoute,
} from "./configRouteUtils.js";

const sections = ["log", "dns", "inbounds", "outbounds", "route", "experimental"];

describe("configRouteUtils", () => {
  it("parses the initial section from config and legacy hashes", () => {
    expect(getInitialActiveSection("#config/3/dns", sections)).toBe("dns");
    expect(getInitialActiveSection("#config/edit/3/route", sections)).toBe("route");
    expect(getInitialActiveSection("#config/edit/3/experimental", sections)).toBe("experimental");
    expect(getInitialActiveSection("#configs?tab=outbounds", sections)).toBe("outbounds");
    expect(getInitialActiveSection("#configs?tab=unknown", sections)).toBe("log");
  });

  it("parses editable config ids and optional sections", () => {
    expect(parseConfigRoute("#configs/edit/12/route", sections)).toEqual({
      isEditing: true,
      configId: 12,
      tab: "route",
    });
    expect(parseConfigRoute("#config/7?tab=dns", sections)).toEqual({
      isEditing: true,
      configId: 7,
      tab: "dns",
    });
    expect(parseConfigRoute("#configs", sections)).toEqual({
      isEditing: false,
      configId: null,
      tab: null,
    });
    expect(parseConfigRoute("#configs/edit/nope/route", sections)).toEqual({
      isEditing: false,
      configId: null,
      tab: null,
    });
  });
});
