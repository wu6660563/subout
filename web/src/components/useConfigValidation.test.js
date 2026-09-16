import { describe, expect, it, vi } from "vitest";
import { reactive, ref } from "vue";
import { useConfigValidation } from "./useConfigValidation.js";

describe("useConfigValidation", () => {
  it("serializes the current section state", () => {
    const controller = useConfigValidation({
      apiBase: "", token: ref(""), sections: ["log"],
      sectionModes: reactive({ log: "source" }),
      rawJson: reactive({ log: '{"level":"debug"}' }),
      sectionSerializers: { log: () => ({}) },
      validateData: vi.fn(() => ({ valid: true })),
      showToast: vi.fn(),
    });
    expect(controller.getFullConfigData()).toEqual({ log: { level: "debug" } });
  });
});
