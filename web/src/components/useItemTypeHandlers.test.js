import { describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import { useItemTypeHandlers } from "./useItemTypeHandlers.js";

describe("useItemTypeHandlers", () => {
  it("replaces DNS server data with the normalized type shape", () => {
    const itemModal = reactive({ itemData: { type: "dns", address: "1.1.1.1" } });
    const handlers = useItemTypeHandlers({
      itemModal,
      isLinux: { value: true },
      isApplePlatform: { value: false },
      isWindowsPlatform: { value: false },
      allOutboundTags: { value: [] },
      normalizeDnsServerForType: vi.fn(() => ({ type: "udp", server: "1.1.1.1" })),
      normalizeInboundForType: vi.fn(),
      normalizeRuleSetForType: vi.fn(),
      normalizeRouteRuleAction: vi.fn(),
    });
    handlers.onModalDnsServerTypeChange();
    expect(itemModal.itemData).toEqual({ type: "udp", server: "1.1.1.1" });
  });
});
