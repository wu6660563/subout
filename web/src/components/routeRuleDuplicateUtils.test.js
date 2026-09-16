import { describe, expect, it } from "vitest";
import {
  buildDuplicateRouteRulesInfo,
  extractCriteriaFromObj,
  hasDuplicateInField,
} from "./routeRuleDuplicateUtils.js";

describe("route rule duplicate utilities", () => {
  it("extracts and normalizes nested rule criteria", () => {
    const items = extractCriteriaFromObj({
      domain_suffix: [".Example.com"],
      ip_cidr: "192.0.2.1",
      type: "logical",
      rules: [{ rule_set: "geosite-cn" }],
    });

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "domain_suffix",
          normValue: "example.com",
        }),
        expect.objectContaining({
          category: "ip_cidr",
          normValue: "192.0.2.1/32",
        }),
        expect.objectContaining({
          category: "rule_set",
          normCategory: "geosite",
          normValue: "cn",
        }),
      ]),
    );
  });

  it("reports duplicate route criteria and rule-set declarations", () => {
    const info = buildDuplicateRouteRulesInfo({
      route: {
        rules: [
          { domain: "example.com", outbound: "direct" },
          { domain: ".EXAMPLE.COM", outbound: "proxy" },
        ],
        rule_set: [{ tag: "geo" }, { tag: " geo " }],
      },
    });

    expect(info).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "domain",
          ruleIndices: [1, 2],
          outbounds: ["direct", "proxy"],
        }),
        expect.objectContaining({
          category: "rule_set_decl",
          value: "geo",
          ruleIndices: [1, 2],
        }),
      ]),
    );
    expect(hasDuplicateInField(info, "domain", ["example.com"])).toBe(true);
    expect(hasDuplicateInField(info, "domain", ["unique.example"])).toBe(false);
  });
});
