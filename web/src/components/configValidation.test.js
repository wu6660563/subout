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

  it("rejects a TUN bypass entry that is the TUN interface or its DNS address", () => {
    const result = validateFullConfigData(
      {
        inbounds: [
          {
            tag: "tun-in",
            type: "tun",
            address: ["172.19.0.1/30"],
            dns_address: ["172.19.0.2"],
            route_exclude_address: ["172.19.0.2/32"],
          },
        ],
      },
      validSection,
    );

    expect(result.valid).toBe(false);
    expect(result.message).toContain("TUN 地址或 TUN DNS 地址");
  });

  it("rejects a TUN bypass CIDR that contains the TUN DNS address", () => {
    const result = validateFullConfigData(
      {
        inbounds: [
          {
            tag: "tun-in",
            type: "tun",
            address: ["172.19.0.1/30"],
            dns_address: ["172.19.0.2"],
            route_exclude_address: ["172.16.0.0/12"],
          },
        ],
      },
      validSection,
    );

    expect(result).toEqual({
      valid: false,
      message: '[inbounds] 配置校验失败: TUN 入站 "tun-in" 的绕过地址 172.16.0.0/12 覆盖 TUN 地址或 TUN DNS 地址（实际范围：172.16.0.0～172.31.255.255），请改用不包含 TUN 网段的精确 CIDR。',
    });
  });

  it("rejects an IPv6 bypass CIDR that contains the TUN DNS address", () => {
    const result = validateFullConfigData(
      {
        inbounds: [
          {
            tag: "tun-v6",
            type: "tun",
            address: ["fd00:1234::1/126"],
            dns_address: ["fd00:1234::2"],
            route_exclude_address: ["fd00::/8"],
          },
        ],
      },
      validSection,
    );

    expect(result).toEqual({
      valid: false,
      message: '[inbounds] 配置校验失败: TUN 入站 "tun-v6" 的绕过地址 fd00::/8 覆盖 TUN 地址或 TUN DNS 地址（实际范围：fd00::/8），请改用不包含 TUN 网段的精确 CIDR。',
    });
  });
});
