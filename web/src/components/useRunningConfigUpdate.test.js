import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useRunningConfigUpdate } from "./useRunningConfigUpdate.js";

describe("useRunningConfigUpdate", () => {
  it("does nothing when the selected config is not running", async () => {
    const getFullConfigData = vi.fn();
    const controller = useRunningConfigUpdate({
      apiBase: "", token: ref(""), currentConfigId: ref(1), currentConfigDetail: ref(""),
      runningConfig: {}, runningConfigForm: {}, isCurrentConfigRunning: ref(false),
      getFullConfigData, validateFullConfigWithSingbox: vi.fn(), loadAllSections: vi.fn(),
      openRunningConfigModal: vi.fn(), saveRunningConfigSettings: vi.fn(), showToast: vi.fn(),
    });
    await controller.triggerUpdateFromDetail();
    expect(getFullConfigData).not.toHaveBeenCalled();
  });
});
