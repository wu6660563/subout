import { describe, expect, it } from "vitest";
import {
  buildLogicalRuleCriteria,
  buildItemValidationData,
  normalizeStandardRuleFields,
} from "./itemRuleUtils.js";

describe("itemRuleUtils", () => {
  it("builds logical criteria from text fields", () => {
    expect(
      buildLogicalRuleCriteria(
        {
          domain: " example.com\nexample.org, ",
          process_name: "curl\n wget ",
          port: "80\ninvalid,443",
        },
        ["domain", "process_name"],
      ),
    ).toEqual([
      { domain: ["example.com", "example.org"] },
      { process_name: ["curl", "wget"] },
      { port: [80, 443] },
    ]);
  });

  it("skips empty criteria and invalid ports", () => {
    expect(
      buildLogicalRuleCriteria(
        { domain: " \n, ", port: "abc, 0, 65535" },
        ["domain"],
      ),
    ).toEqual([{ port: [0, 65535] }]);
  });

  it("writes standard fields and converts ports by item type", () => {
    const source = {
      domain: ["old.example"],
      process_name: ["old-process"],
      port: [80],
      tag: "rule",
    };

    expect(
      normalizeStandardRuleFields(
        source,
        { domain: " example.com, example.org ", process_name: "" , port: "443" },
        ["domain", "process_name"],
        "route_rule",
      ),
    ).toEqual({
      domain: ["example.com", "example.org"],
      port: [443],
      tag: "rule",
    });
    expect(source).toEqual({
      domain: ["old.example"],
      process_name: ["old-process"],
      port: [80],
      tag: "rule",
    });

    expect(
      normalizeStandardRuleFields(
        { type: "vmess" },
        { port: "443" },
        [],
        "outbound",
      ),
    ).toEqual({ type: "vmess", port: 443 });
  });

  it("builds validation data for logical rules and outbound ports", () => {
    expect(
      buildItemValidationData(
        { tag: "rule", action: "route", outbound: "proxy" },
        { domain: "example.com", port: "80,443" },
        "route_rule",
        "and",
        ["domain"],
      ),
    ).toEqual({
      tag: "rule",
      action: "route",
      outbound: "proxy",
      type: "logical",
      mode: "and",
      rules: [{ domain: ["example.com"] }, { port: [80, 443] }],
    });
    expect(
      buildItemValidationData(
        { type: "vmess" },
        { port: "443" },
        "outbound",
        "standard",
        [],
      ),
    ).toEqual({ type: "vmess", server_port: 443 });
  });
});
