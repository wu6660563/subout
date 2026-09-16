import { describe, expect, it } from "vitest";
import {
  getBrowserPresets,
  getProcessNamePlaceholder,
  getProcessPathPlaceholder,
} from "./platformPresets.js";

describe("platform presets", () => {
  it("returns platform-specific browser executable names", () => {
    expect(getBrowserPresets("windows")[0]).toMatchObject({
      label: "🌐 Chrome",
      name: "chrome.exe",
    });
    expect(getBrowserPresets("linux")[0].name).toBe("chrome");
    expect(getBrowserPresets("macos")[0].name).toEqual([
      "Google Chrome",
      "Google Chrome Helper",
    ]);
  });

  it("returns platform-specific process placeholders", () => {
    expect(getProcessNamePlaceholder("windows")).toContain("chrome.exe");
    expect(getProcessPathPlaceholder("macos")).toContain("/Applications/Google Chrome.app");
    expect(getProcessPathPlaceholder("linux")).toContain("/opt/google/chrome/chrome");
  });
});
