import { describe, expect, it } from "vitest";
import {
  applyDomainWizardRule,
  buildSortedOutboundsForSelect,
  calculateOutboundRecommendations,
  findMatchingDomainRouteRule,
  getCommonSuffix,
  parseDomainWizardInput,
} from "./domainWizardUtils.js";

describe("domain wizard utilities", () => {
  it("finds the common suffix across multiple domains", () => {
    expect(getCommonSuffix(["a.example.com", "b.example.com"])).toBe(
      "example.com",
    );
    expect(getCommonSuffix(["a.example.com", "other.net"])).toBe("");
  });

  it("ranks healthy proxy nodes and groups", () => {
    const outbounds = [
      { tag: "slow-node", type: "vmess" },
      { tag: "fast-node", type: "vmess" },
      { tag: "auto-group", type: "urltest", outbounds: ["fast-node"] },
    ];
    const results = {
      "slow-node": { latency: 300 },
      "fast-node": { latency: 80 },
    };

    const recommendation = calculateOutboundRecommendations(outbounds, results);

    expect(recommendation.recommendedOutbound).toBe("auto-group");
    expect(recommendation.recommendationLog).toContain("auto-group");
  });

  it("sorts direct, groups, and proxy nodes with the recommended item first", () => {
    const outbounds = [
      { tag: "direct", type: "direct" },
      { tag: "node", type: "vmess" },
      { tag: "group", type: "selector", outbounds: ["node"] },
    ];
    const list = buildSortedOutboundsForSelect(
      outbounds,
      { node: { latency: 100 } },
      "node",
    );

    expect(list[0]).toMatchObject({ tag: "node", isRecommended: true });
    expect(list.map((item) => item.tag)).toEqual(["node", "group", "direct"]);
  });

  it("parses precise and wildcard domain input without accepting invalid values", () => {
    expect(parseDomainWizardInput("Example.com")).toMatchObject({
      domains: ["example.com"],
      detectedType: "precise",
      testUrl: "example.com",
    });
    expect(parseDomainWizardInput("a.example.com, b.example.com")).toMatchObject({
      domains: ["a.example.com", "b.example.com"],
      detectedType: "wildcard",
      extractedSuffix: "example.com",
    });
    expect(parseDomainWizardInput("not a domain").errorMsg).toContain(
      "非法的域名格式",
    );
  });

  it("applies wizard rules immutably and avoids duplicate values", () => {
    const rules = [
      { outbound: "proxy", domain_suffix: ["example.com"] },
      { outbound: "proxy", ip_cidr: ["1.1.1.1/32"] },
    ];
    const existingRule = findMatchingDomainRouteRule(rules, "proxy");

    expect(existingRule).toBe(rules[0]);
    const merged = applyDomainWizardRule({
      routeRules: rules,
      selectedOutbound: "proxy",
      domains: ["api.example.com"],
      detectedType: "precise",
      targetRuleAction: "append",
    });
    expect(merged).toMatchObject({
      action: "merged",
      targetValue: "api.example.com",
    });
    expect(merged.routeRules[0]).toEqual({
      outbound: "proxy",
      domain_suffix: ["example.com"],
      domain: ["api.example.com"],
    });
    expect(rules[0].domain).toBeUndefined();

    const created = applyDomainWizardRule({
      routeRules: rules,
      selectedOutbound: "proxy",
      domains: ["api.example.com"],
      detectedType: "precise",
      targetRuleAction: "create",
    });
    expect(created).toMatchObject({
      action: "created",
    });
    expect(created.routeRules[0]).toEqual({
      outbound: "proxy",
      domain: ["api.example.com"],
    });
  });
});
