import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useNodePoolCache } from "./useNodePoolCache.js";

describe("useNodePoolCache", () => {
  it("deduplicates concurrent node requests", async () => {
    let resolve;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((done) => { resolve = done; })));
    const cache = ref([]);
    const controller = useNodePoolCache({ apiBase: "", token: ref(""), nodePoolCache: cache });
    const first = controller.loadNodePoolCache();
    const second = controller.loadNodePoolCache();
    expect(fetch).toHaveBeenCalledTimes(1);
    resolve({ ok: true, json: async () => ({ nodes: [{ tag: "a" }] }) });
    await expect(Promise.all([first, second])).resolves.toEqual([[{ tag: "a" }], [{ tag: "a" }]]);
  });
});
