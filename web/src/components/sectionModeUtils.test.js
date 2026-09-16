import { describe, expect, it, vi } from "vitest";
import { prepareSectionModeChange } from "./sectionModeUtils.js";

describe("sectionModeUtils", () => {
  it("parses source json when switching to visual mode", () => {
    expect(
      prepareSectionModeChange("visual", '{"enabled":true}', vi.fn()),
    ).toEqual({ mode: "visual", parsed: { enabled: true } });
  });

  it("serializes visual data when switching to source mode", () => {
    const serialize = vi.fn(() => ({ enabled: true, level: "info" }));

    expect(prepareSectionModeChange("json", "{}", serialize)).toEqual({
      mode: "json",
      rawJson: '{\n  "enabled": true,\n  "level": "info"\n}',
    });
    expect(serialize).toHaveBeenCalledOnce();
  });

  it("propagates invalid source json errors", () => {
    expect(() => prepareSectionModeChange("visual", "invalid", vi.fn())).toThrow(
      SyntaxError,
    );
  });
});
