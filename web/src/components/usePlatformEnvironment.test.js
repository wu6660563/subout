import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { usePlatformEnvironment } from "./usePlatformEnvironment.js";

describe("usePlatformEnvironment", () => {
  it("updates platform state from system info", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ os: "windows" }) })));
    const env = usePlatformEnvironment({ apiBase: "", token: ref("") });
    await env.fetchSystemInfo();
    expect(env.systemOs.value).toBe("windows");
    expect(env.isWindowsPlatform.value).toBe(true);
    expect(env.browserPresets.value[0].name).toContain(".exe");
  });
});
