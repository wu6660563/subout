import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useConfigPreview } from "./useConfigPreview.js";

describe("useConfigPreview", () => {
  it("validates before generating and orders the generated preview", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: true, command_missing: false }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ z: 1, a: 2 }),
      });
    const controller = useConfigPreview({
      apiBase: "",
      token: ref("t"),
      getSerializedState: () => ({ route: {} }),
      orderSections: (data) => ({ a: data.a, z: data.z }),
      showToast: vi.fn(),
    });

    await controller.previewGeneratedConfig();

    expect(controller.previewModal.content).toBe('{\n  "a": 2,\n  "z": 1\n}');
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      "/api/config/validate",
      expect.objectContaining({ method: "POST" }),
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/config/generated",
      expect.objectContaining({ method: "POST" }),
    );

    globalThis.fetch = originalFetch;
  });

  it("shows validation details and skips generation when validation fails", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        valid: false,
        error: '配置校验失败：存在未知或不支持的属性 "clash_api"',
      }),
    }));
    const controller = useConfigPreview({
      apiBase: "",
      token: ref("t"),
      getSerializedState: () => ({ experimental: { clash_api: {} } }),
      orderSections: (data) => data,
      showToast: vi.fn(),
    });

    await controller.previewGeneratedConfig();

    expect(controller.previewModal.error).toContain("clash_api");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    globalThis.fetch = originalFetch;
  });
});
