import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useConfigEditorState } from "./useConfigEditorState.js";

describe("useConfigEditorState", () => {
  it("keeps parser and serializer functions connected to shared state", () => {
    const state = useConfigEditorState({
      isLinux: ref(true), showToast: vi.fn(), sanitizeOutboundItem: (item) => item,
    });
    state.parseLog({ level: "debug", timestamp: false });
    expect(state.configData.log.level).toBe("debug");
    expect(state.sectionSerializers.log()).toEqual(expect.objectContaining({ level: "debug", timestamp: false }));
  });
});
