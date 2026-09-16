import { describe, expect, it } from "vitest";
import { orderConfigSections } from "./configPreviewUtils.js";

describe("configPreviewUtils", () => {
  it("orders known sections and keeps unknown fields at the end", () => {
    const data = {
      custom: { enabled: true },
      route: { rules: [] },
      log: { level: "info" },
      experimental: undefined,
      dns: { servers: [] },
    };

    expect(Object.keys(orderConfigSections(data))).toEqual([
      "log",
      "dns",
      "route",
      "custom",
    ]);
    expect(orderConfigSections(data)).toEqual({
      log: { level: "info" },
      dns: { servers: [] },
      route: { rules: [] },
      custom: { enabled: true },
    });
  });

  it("does not mutate the response object", () => {
    const data = { route: {}, other: 1 };
    const ordered = orderConfigSections(data, ["route"]);

    expect(ordered).toEqual({ route: {}, other: 1 });
    expect(Object.keys(data)).toEqual(["route", "other"]);
  });
});
