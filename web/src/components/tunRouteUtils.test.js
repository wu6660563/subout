import { describe, expect, it } from "vitest";
import { addSafePrivateBypassAddresses } from "./tunRouteUtils.js";

describe("tunRouteUtils", () => {
  it("adds private bypass routes without adding networks that contain TUN or TUN DNS addresses", () => {
    expect(
      addSafePrivateBypassAddresses(
        ["10.16.0.0/12"],
        {
          address: ["172.19.0.1/30"],
          dns_address: ["172.19.0.2"],
        },
      ),
    ).toEqual(["10.16.0.0/12", "10.0.0.0/8", "192.168.0.0/16", "100.64.0.0/10", "169.254.0.0/16"]);
  });

  it("does not duplicate existing bypass routes and omits a preset that contains a 10.x TUN address", () => {
    expect(
      addSafePrivateBypassAddresses(
        ["192.168.0.0/16"],
        { address: ["10.0.0.1/30"] },
      ),
    ).toEqual(["192.168.0.0/16", "172.16.0.0/12", "100.64.0.0/10", "169.254.0.0/16"]);
  });
});
