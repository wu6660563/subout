import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useConfigNavigation } from "./useConfigNavigation.js";

describe("useConfigNavigation", () => {
  it("enters edit mode and updates the hash", async () => {
    vi.stubGlobal("window", { location: { hash: "#configs" } });
    const activeSection = ref("dns");
    const currentConfigId = ref(null);
    const controller = useConfigNavigation({
      sections: ["dns"], activeSection, currentConfigId,
      configList: ref([{ id: 3 }]), showToast: vi.fn(),
      loadNodePoolCache: vi.fn(), selectConfig: vi.fn(),
    });
    await controller.startEditConfig(3);
    expect(controller.isEditing.value).toBe(true);
    expect(window.location.hash).toBe("#configs/edit/3/dns");
  });
});
