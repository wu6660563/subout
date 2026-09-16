import { describe, expect, it, vi } from "vitest";
import { nextTick, reactive, ref } from "vue";
import { useDomainWizard } from "./useDomainWizard.js";

describe("useDomainWizard", () => {
  it("derives input state and creates a route rule through one controller", async () => {
    const configData = reactive({
      outbounds: [{ tag: "proxy", type: "vless" }],
      route: { rules: [] },
    });
    const showToast = vi.fn();
    const wizard = useDomainWizard({ configData, showToast });

    wizard.openDomainWizard();
    wizard.domainWizardModal.inputText = "example.com";
    await nextTick();
    wizard.domainWizardModal.selectedOutbound = "proxy";
    wizard.confirmApplyDomainWizard();

    expect(configData.route.rules).toEqual([
      { outbound: "proxy", domain: ["example.com"] },
    ]);
    expect(wizard.domainWizardModal.show).toBe(false);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining("已成功创建"));
  });

  it("runs node latency batches through injected infrastructure", async () => {
    const configData = reactive({
      outbounds: [{ tag: "node", type: "vless" }],
      route: { rules: [] },
    });
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => [{ tcp_latency: 40, web_latency: 30 }],
    }));
    const wizard = useDomainWizard({
      configData,
      showToast: vi.fn(),
      nodePoolCache: ref([{ id: 1, tag: "node" }]),
      loadNodePoolCache: vi.fn(),
      apiBase: "/api-base",
      token: ref("token"),
      fetcher,
      schedule: (callback) => callback(),
    });
    wizard.domainWizardModal.inputText = "example.com";
    await nextTick();

    await wizard.startLatencyTest();

    expect(fetcher).toHaveBeenCalledWith(
      "/api-base/api/nodes/ping",
      expect.objectContaining({ method: "POST" }),
    );
    expect(wizard.domainWizardModal.testProgress).toBe(1);
    expect(wizard.domainWizardModal.recommendedOutbound).toBe("node");
  });
});
