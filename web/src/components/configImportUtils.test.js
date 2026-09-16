import { describe, expect, it } from "vitest";
import { prepareImportedConfig } from "./configImportUtils.js";

describe("prepareImportedConfig", () => {
  it("normalizes legacy DNS servers and unsupported inbound fields", () => {
    const result = prepareImportedConfig(
      { servers: [{ address: "1.1.1.1", type: "doh" }], inbounds: [{ type: "tun", auto_redirect: true, interface_name: "tun0" }] },
      { isLinux: false, isApplePlatform: false },
    );
    expect(result.sections.dns.servers).toEqual([{ server: "1.1.1.1", type: "https" }]);
    expect(result.sections.inbounds[0]).toEqual({ type: "tun", interface_name: "" });
    expect(result.notices).toEqual({ removedAutoRedirect: true, resetInterfaceName: true });
  });
});
