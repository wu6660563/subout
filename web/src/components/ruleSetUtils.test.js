import { describe, expect, it } from "vitest";
import { normalizeRuleSetForType } from "./ruleSetUtils.js";

describe("ruleSetUtils", () => {
  it("adds remote defaults and prefers the proxy outbound", () => {
    expect(
      normalizeRuleSetForType(
        { type: "remote", path: "/tmp/old", url: "https://example.com/rules" },
        ["direct", "proxy"],
      ),
    ).toEqual({
      type: "remote",
      url: "https://example.com/rules",
      format: "binary",
      download_detour: "proxy",
      update_interval: "1d",
    });
  });

  it("falls back to the first outbound or direct", () => {
    expect(normalizeRuleSetForType({ type: "remote" }, ["relay"])).toMatchObject({
      download_detour: "relay",
    });
    expect(normalizeRuleSetForType({ type: "remote" }, [])).toMatchObject({
      download_detour: "direct",
    });
  });

  it("keeps local path and format while removing remote-only fields", () => {
    const source = {
      type: "local",
      url: "https://example.com/rules",
      download_detour: "proxy",
      update_interval: "1d",
      format: "source",
    };

    expect(normalizeRuleSetForType(source, ["proxy"])).toEqual({
      type: "local",
      path: "",
      format: "source",
    });
    expect(source.url).toBe("https://example.com/rules");
  });
});
