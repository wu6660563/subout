import { describe, expect, it } from "vitest";
import { getRuleSummaryText } from "./ruleSummaryUtils.js";

describe("ruleSummaryUtils", () => {
  it("formats dns and route rule summaries", () => {
    expect(
      getRuleSummaryText(
        { server: "remote-dns", domain_suffix: ["example.com", "example.org", "example.net"] },
        1,
        "dns",
      ),
    ).toBe("#2 (DNS: remote-dns) - domain_suffix: example.com,example.org...");
    expect(getRuleSummaryText({ action: "route" }, 0, "route")).toBe(
      "#1 (Outbound: route) - 全匹配规则",
    );
  });

  it("includes logical mode and nested criteria", () => {
    expect(
      getRuleSummaryText(
        {
          type: "logical",
          mode: "and",
          rules: [{ process_name: ["curl"] }, { domain: ["example.com"] }],
        },
        2,
        "route",
      ),
    ).toBe(
      "#3 (Outbound: 未指定 - [逻辑 AND]) - domain: example.com | process_name: curl",
    );
  });

  it("returns an empty summary for a missing rule", () => {
    expect(getRuleSummaryText(null, 0, "dns")).toBe("");
  });
});
