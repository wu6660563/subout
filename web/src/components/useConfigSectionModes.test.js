import { describe, expect, it, vi } from "vitest";
import { reactive, ref } from "vue";
import { useConfigSectionModes } from "./useConfigSectionModes.js";

describe("useConfigSectionModes", () => {
  it("switches source JSON to visual mode and reports syntax errors", () => {
    const modes = reactive({ dns: "source" });
    const rawJson = reactive({ dns: '{"servers":[]}' });
    const parseDns = vi.fn();
    const showToast = vi.fn();
    const controller = useConfigSectionModes({
      apiBase: "",
      token: ref("token"),
      sectionModes: modes,
      rawJson,
      sectionParsers: { dns: parseDns },
      sectionSerializers: { dns: () => ({}) },
      validateData: vi.fn(() => ({ valid: true })),
      showToast,
      loadAllSections: vi.fn(),
    });

    controller.setSectionMode("dns", "visual");
    expect(parseDns).toHaveBeenCalledWith({ servers: [] });
    expect(modes.dns).toBe("visual");

    rawJson.dns = "{";
    modes.dns = "source";
    controller.setSectionMode("dns", "visual");
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining("JSON 语法解析错误"), "danger");
    expect(modes.dns).toBe("source");
  });
});
