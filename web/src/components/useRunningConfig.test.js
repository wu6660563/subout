import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useRunningConfig } from "./useRunningConfig.js";

const createHarness = () => {
  const showToast = vi.fn();
  const promptDialog = vi.fn().mockResolvedValue(null);
  const fetchServiceStatus = vi.fn().mockResolvedValue(undefined);
  const controller = useRunningConfig({
    apiBase: "http://localhost",
    token: ref("token"),
    currentConfigId: ref(1),
    sessionSudoPassword: ref(""),
    setSessionSudoPassword: vi.fn(),
    serviceStatus: ref({ conflicting_processes: [] }),
    fetchServiceStatus,
    systemModeInfo: ref({ os: "linux" }),
    promptDialog,
    showToast,
  });

  return { ...controller, showToast, promptDialog, fetchServiceStatus };
};

describe("useRunningConfig", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("adds a 60-second timeout signal to running config requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "success" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { saveRunningConfigSettings } = createHarness();

    await saveRunningConfigSettings(true);

    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("shows a specific message when the update request times out", async () => {
    const timeoutError = Object.assign(new Error("The operation timed out"), {
      name: "TimeoutError",
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeoutError));
    const { saveRunningConfigSettings, runningConfigModal, showToast } =
      createHarness();

    await saveRunningConfigSettings(true);

    expect(runningConfigModal.message).toBe(
      "更新请求超时，请检查 sing-box 服务状态",
    );
    expect(showToast).toHaveBeenCalledWith(
      "运行配置更新请求超时",
      "danger",
    );
  });

  it("recognizes TUNSETIFF permission errors and asks for sudo credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "failed", message: "TUNSETIFF failed" }),
      }),
    );
    const { saveRunningConfigSettings, promptDialog } = createHarness();

    await saveRunningConfigSettings(true);

    expect(promptDialog).toHaveBeenCalled();
  });

  it("gives a wrong-password prompt when sudo authentication fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "failed",
          message: "sudo 密码不正确",
        }),
      }),
    );
    const { saveRunningConfigSettings, promptDialog } = createHarness();

    await saveRunningConfigSettings(true);

    expect(promptDialog.mock.calls[0][0]).toContain("密码不正确");
  });

  it("does not ask for sudo when the backend reports a Windows administrator error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "failed",
          message: "Windows TUN 权限失败，请以管理员身份运行",
        }),
      }),
    );
    const { saveRunningConfigSettings, promptDialog, showToast } =
      createHarness();

    await saveRunningConfigSettings(true);

    expect(promptDialog).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      "Windows TUN 权限失败，请以管理员身份运行",
      "danger",
    );
  });
});
