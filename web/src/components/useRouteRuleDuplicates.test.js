import { describe, expect, it } from "vitest";
import { reactive } from "vue";
import { useRouteRuleDuplicates } from "./useRouteRuleDuplicates.js";

describe("useRouteRuleDuplicates", () => {
  it("derives duplicate criteria from route rules", () => {
    const state = useRouteRuleDuplicates({
      configData: reactive({ route: { rules: [{ domain: ["example.com"] }, { domain: ["example.com"] }] } }),
    });
    expect(state.duplicateRouteRulesInfo.value).toBeTruthy();
    expect(state.isDuplicateCriteriaItem("domain", "example.com")).toBe(true);
  });
});
