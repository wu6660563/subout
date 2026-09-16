import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useConfigPreview } from "./useConfigPreview.js";

describe("useConfigPreview", () => {
  it("serializes and orders a generated preview", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ z: 1, a: 2 }) }));
    const controller = useConfigPreview({ apiBase: "", token: ref("t"), getSerializedState: () => ({ route: {} }), orderSections: (data) => ({ a: data.a, z: data.z }), showToast: vi.fn() });
    await controller.previewGeneratedConfig();
    expect(controller.previewModal.content).toBe('{\n  "a": 2,\n  "z": 1\n}');
    globalThis.fetch = originalFetch;
  });
});
