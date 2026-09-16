import { describe, expect, it } from "vitest";
import {
  ITEM_ARRAY_FIELDS,
  ITEM_ARRAY_FIELDS_WITHOUT_PORT,
  buildItemTempFields,
  getDuplicateItemTagError,
  getOutboundGroupValidationError,
  mergeLogicalRuleTempFields,
  serializeItemDataForSource,
} from "./itemEditorUtils.js";

describe("itemEditorUtils", () => {
  it("exposes consistent editor field sets", () => {
    expect(ITEM_ARRAY_FIELDS).toContain("port");
    expect(ITEM_ARRAY_FIELDS_WITHOUT_PORT).not.toContain("port");
    expect(ITEM_ARRAY_FIELDS_WITHOUT_PORT).toEqual(
      ITEM_ARRAY_FIELDS.filter((field) => field !== "port"),
    );
  });

  it("clones item data and converts outbound port to server_port", () => {
    const source = { type: "vmess", server: "127.0.0.1", port: 443 };

    expect(serializeItemDataForSource(source, "outbound")).toEqual({
      type: "vmess",
      server: "127.0.0.1",
      server_port: 443,
    });
    expect(source).toEqual({ type: "vmess", server: "127.0.0.1", port: 443 });
  });

  it("keeps non-outbound items unchanged apart from cloning", () => {
    const source = { type: "route", port: [80, 443] };
    const result = serializeItemDataForSource(source, "route_rule");

    expect(result).toEqual(source);
    result.port.push(8080);
    expect(source.port).toEqual([80, 443]);
  });

  it("builds visual temp fields from arrays and scalar values", () => {
    expect(
      buildItemTempFields(
        { domain: ["example.com", "example.org"], port: 443 },
        ["domain", "port", "process_name"],
      ),
    ).toEqual({
      domain: "example.com\nexample.org",
      port: "443",
      process_name: "",
    });
  });

  it("merges logical subrule values into temp fields without duplicates", () => {
    expect(
      mergeLogicalRuleTempFields(
        { domain: "example.com", port: "80" },
        [
          { domain: ["example.org", "example.com"], port: [443] },
          { process_name: "curl" },
        ],
        ["domain", "port", "process_name"],
      ),
    ).toEqual({
      domain: "example.com\nexample.org",
      port: "80\n443",
      process_name: "curl",
    });
  });

  it("validates that outbound groups have child outbounds", () => {
    expect(
      getOutboundGroupValidationError({ type: "urltest", outbounds: [] }),
    ).toBe("出站组必须关联至少一个子出站/节点 (outbounds 列表不能为空)");
    expect(
      getOutboundGroupValidationError({ type: "selector", outbounds: ["proxy"] }),
    ).toBe("");
    expect(getOutboundGroupValidationError({ type: "vmess" })).toBe("");
  });

  it("detects duplicate inbound and outbound tags while excluding itself", () => {
    const configData = {
      inbounds: [{ tag: "http" }],
      outbounds: [{ tag: "proxy" }, { tag: "relay" }],
    };

    expect(
      getDuplicateItemTagError("inbound", { tag: "http" }, configData, -1),
    ).toBe('标签 (tag) "http" 重复，列表中已存在相同的 tag');
    expect(
      getDuplicateItemTagError("outbound", { tag: "proxy" }, configData, 0),
    ).toBe("");
    expect(
      getDuplicateItemTagError("dns_rule", { tag: "proxy" }, configData, -1),
    ).toBe("");
  });
});
