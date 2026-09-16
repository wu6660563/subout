import { describe, expect, it, vi } from "vitest";
import { normalizeImportedOutbounds } from "./outboundImportUtils.js";

describe("outboundImportUtils", () => {
  it("clones imported outbounds and maps server_port to port", () => {
    const sanitize = vi.fn((outbound) => ({ ...outbound, tag: outbound.tag.trim() }));
    const source = [{ tag: " node ", server: "127.0.0.1", server_port: 443 }];

    const result = normalizeImportedOutbounds(source, sanitize);

    expect(result).toEqual([
      { tag: "node", server: "127.0.0.1", server_port: 443, port: 443 },
    ]);
    expect(source[0]).toEqual({ tag: " node ", server: "127.0.0.1", server_port: 443 });
    expect(sanitize).toHaveBeenCalledOnce();
  });

  it("returns an empty list for non-array input", () => {
    expect(normalizeImportedOutbounds({ tag: "node" }, vi.fn())).toEqual([]);
  });
});
