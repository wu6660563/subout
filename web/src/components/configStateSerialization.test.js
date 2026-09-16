import { describe, expect, it, vi } from "vitest";
import {
  getConfigSectionContent,
  serializeConfigState,
} from "./configStateSerialization.js";

const sections = ["log", "dns", "route"];

describe("configStateSerialization", () => {
  it("uses visual serializers for visual sections", () => {
    const serializers = {
      log: vi.fn(() => ({ level: "info" })),
      dns: vi.fn(() => ({ servers: [] })),
      route: vi.fn(() => ({ rules: [] })),
    };

    expect(
      serializeConfigState(
        sections,
        { log: "visual", dns: "json", route: "visual" },
        { log: "{}", dns: '{"servers":[{"tag":"local"}]}', route: "{}" },
        serializers,
      ),
    ).toEqual({
      log: { level: "info" },
      dns: { servers: [{ tag: "local" }] },
      route: { rules: [] },
    });
    expect(serializers.log).toHaveBeenCalledOnce();
    expect(serializers.route).toHaveBeenCalledOnce();
    expect(serializers.dns).not.toHaveBeenCalled();
  });

  it("returns null when a json section cannot be parsed", () => {
    expect(
      serializeConfigState(
        ["dns"],
        { dns: "json" },
        { dns: "invalid json" },
        {},
      ),
    ).toEqual({ dns: null });
  });

  it("reports json parse errors to callers that need strict handling", () => {
    const onParseError = vi.fn();

    expect(
      serializeConfigState(
        ["route"],
        { route: "json" },
        { route: "invalid json" },
        {},
        { onParseError },
      ),
    ).toEqual({ route: null });
    expect(onParseError).toHaveBeenCalledOnce();
    expect(onParseError.mock.calls[0][0]).toBe("route");
    expect(onParseError.mock.calls[0][1]).toBeInstanceOf(SyntaxError);
  });

  it("gets one section from either visual or source mode", () => {
    const serialize = vi.fn(() => ({ level: "info" }));

    expect(
      getConfigSectionContent("log", "visual", { log: "{}" }, { log: serialize }),
    ).toEqual({ level: "info" });
    expect(
      getConfigSectionContent("dns", "json", { dns: '{"servers":[]}' }, {}),
    ).toEqual({ servers: [] });
    expect(serialize).toHaveBeenCalledOnce();
  });
});
