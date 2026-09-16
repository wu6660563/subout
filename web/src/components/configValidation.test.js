import { describe, expect, it } from "vitest";
import { validateFullConfigData } from "./configValidation.js";

const validSection = () => ({ valid: true, errors: [] });

describe("config validation", () => {
  it("rejects duplicate inbound and outbound tags", () => {
    const result = validateFullConfigData(
      {
        outbounds: [
          { tag: "proxy", type: "vmess" },
          { tag: "proxy", type: "vless" },
        ],
        inbounds: [
          { tag: "mixed" },
          { tag: "mixed" },
        ],
      },
      validSection,
    );

    expect(result).toEqual({
      valid: false,
      message: '[outbounds] 配置校验失败: 出站连接中存在重复的 tag: "proxy"，请修改或删除重复项。',
    });
  });

  it("rejects an empty strategy group", () => {
    const result = validateFullConfigData(
      {
        outbounds: [{ tag: "auto", type: "urltest", outbounds: [] }],
      },
      validSection,
    );

    expect(result.valid).toBe(false);
    expect(result.message).toContain("未配置任何目标节点/出站");
  });

  it("delegates section schema validation and accepts valid data", () => {
    const validateSection = (section, value) => {
      expect(section).toBe("log");
      expect(value).toEqual({ level: "info" });
      return validSection();
    };

    expect(
      validateFullConfigData({ log: { level: "info" } }, validateSection),
    ).toEqual({ valid: true, message: "" });
  });
});
