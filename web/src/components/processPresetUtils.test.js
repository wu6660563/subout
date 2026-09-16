import { describe, expect, it } from "vitest";
import { appendPresetProcesses } from "./processPresetUtils.js";

describe("processPresetUtils", () => {
  it("appends trimmed string presets without duplicates", () => {
    expect(
      appendPresetProcesses(" curl\nfirefox\n", "curl\n  wget  "),
    ).toBe("curl\nfirefox\nwget");
  });

  it("accepts array presets and preserves their values", () => {
    expect(appendPresetProcesses("node", ["node", "python", "go"])).toBe(
      "node\npython\ngo",
    );
  });

  it("handles an empty current value", () => {
    expect(appendPresetProcesses("", "chrome")).toBe("chrome");
  });
});
