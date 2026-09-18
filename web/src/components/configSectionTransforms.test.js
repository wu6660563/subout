import { describe, expect, it, vi } from "vitest";
import {
  parseDns,
  parseExperimental,
  parseInbounds,
  parseLog,
  serializeDns,
  serializeExperimental,
  serializeOutbounds,
} from "./configSectionTransforms.js";

describe("config section transforms", () => {
  it("parses log and DNS values without mutating the source JSON", () => {
    const target = {
      log: {},
      dns: { fakeip: {} },
    };
    const json = {
      disabled: true,
      level: "debug",
      timestamp: false,
      servers: [{ address: "1.1.1.1", type: "doh" }],
      rules: [{ domain_suffix: ["example.com"] }],
      fakeip: { inet4_range: "198.18.0.0/15" },
    };

    parseLog(target, json);
    parseDns(target, json);

    expect(target.log).toMatchObject({ disabled: true, level: "debug", timestamp: false });
    expect(target.dns.servers).toEqual([
      { server: "1.1.1.1", type: "https" },
    ]);
    expect(target.dns.rules).toEqual(json.rules);
    expect(json.servers[0]).toEqual({ address: "1.1.1.1", type: "doh" });
  });

  it("removes unsupported auto redirect on non-Linux platforms", () => {
    const target = { inbounds: [] };
    const notify = vi.fn();

    parseInbounds(
      target,
      [{ type: "tun", auto_redirect: true }],
      true,
      false,
      notify,
    );

    expect(target.inbounds).toEqual([{ type: "tun" }]);
    expect(notify).toHaveBeenCalledOnce();
  });

  it("serializes DNS and normalizes outbound ports", () => {
    const data = {
      dns: {
        strategy: "ipv4_only",
        final: "dns-local",
        independent_cache: true,
        disable_cache: false,
        disable_expire: false,
        reverse_mapping: false,
        client_subnet: "  192.0.2.0/24 ",
        servers: [{ server: "1.1.1.1", detour: "" }],
        rules: [],
        fakeip: { enabled: false },
        _extra: {},
      },
      outbounds: [{ tag: "proxy", type: "vmess", port: "443" }],
    };

    expect(serializeDns(data)).toMatchObject({
      client_subnet: "192.0.2.0/24",
      servers: [{ server: "1.1.1.1" }],
    });
    expect(
      serializeOutbounds(data, (outbound) => ({ ...outbound })),
    ).toEqual([{ tag: "proxy", type: "vmess", server_port: 443 }]);
  });

  it("keeps an explicit empty Clash API object when the editor disables it", () => {
    const data = {
      experimental: {
        cache_file: { enabled: false },
        clash_api: { enabled: false },
        _extra: {},
      },
    };

    expect(serializeExperimental(data)).toEqual({ clash_api: {} });
  });

  it("round-trips an empty Clash API object as disabled", () => {
    const target = {
      experimental: {
        cache_file: {},
        clash_api: {},
      },
    };

    parseExperimental(target, { clash_api: {} });

    expect(target.experimental.clash_api.enabled).toBe(false);
    expect(serializeExperimental(target)).toEqual({ clash_api: {} });
  });
});
