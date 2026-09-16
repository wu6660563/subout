import { describe, expect, it } from "vitest";
import {
  formatRunningConfigLogs,
  getRunningConfigName,
  isConfigRunning,
} from "./runningConfigUtils.js";

describe("runningConfigUtils", () => {
  it("formats execution logs for clipboard output", () => {
    expect(
      formatRunningConfigLogs([
        {
          timestamp: "10:00:01",
          step: "download",
          status: "success",
          message: "完成",
        },
        {
          timestamp: "10:00:02",
          step: "start",
          message: "服务已启动",
        },
      ]),
    ).toBe(
      "[10:00:01] [download] [SUCCESS] 完成\n[10:00:02] [start] [] 服务已启动",
    );
  });

  it("returns empty text for missing logs", () => {
    expect(formatRunningConfigLogs([])).toBe("");
    expect(formatRunningConfigLogs(null)).toBe("");
  });

  it("resolves running config names with fallbacks", () => {
    const configs = [
      { id: 1, detail: "家庭配置" },
      { id: 2, detail: "" },
    ];

    expect(getRunningConfigName(configs, 1)).toBe("家庭配置");
    expect(getRunningConfigName(configs, 2)).toBe("未命名配置");
    expect(getRunningConfigName(configs, 3)).toBe("未知配置");
  });

  it("compares current and running config ids safely", () => {
    expect(isConfigRunning(1, "1")).toBe(true);
    expect(isConfigRunning(null, 1)).toBe(false);
    expect(isConfigRunning(1, undefined)).toBe(false);
    expect(isConfigRunning(1, 2)).toBe(false);
  });
});
