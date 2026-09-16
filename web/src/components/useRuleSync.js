import { reactive } from "vue";
import { buildSyncedRule, getRuleSyncValidationError } from "./ruleSyncUtils.js";
import { getRuleSummaryText as getRuleSummaryTextUtil } from "./ruleSummaryUtils.js";

export const useRuleSync = ({ configData, allOutboundTags, showToast }) => {
  const ruleSyncModal = reactive({ show: false, direction: "route_to_dns", sourceIndex: -1, sourceRule: null, mode: "new", targetIndex: -1, targetDnsServer: "", targetClientSubnet: "", targetRouteAction: "route", targetRouteOutbound: "", error: "" });
  const openSyncModal = (rule, sourceSection, index) => {
    Object.assign(ruleSyncModal, { direction: sourceSection === "route" ? "route_to_dns" : "dns_to_route", sourceIndex: index, sourceRule: JSON.parse(JSON.stringify(rule)), mode: "new", targetIndex: -1, error: "", targetDnsServer: configData.dns.servers?.[0]?.tag || "local-dns", targetClientSubnet: rule.client_subnet || "", targetRouteAction: rule.action || "route", targetRouteOutbound: rule.outbound || (allOutboundTags.value.includes("proxy") ? "proxy" : allOutboundTags.value[0] || ""), show: true });
  };
  const getRuleSummaryText = (rule, index, type) => getRuleSummaryTextUtil(rule, index, type);
  const confirmSyncRule = () => {
    ruleSyncModal.error = ""; const toDns = ruleSyncModal.direction === "route_to_dns"; const error = getRuleSyncValidationError(ruleSyncModal); if (error) { ruleSyncModal.error = error; return; }
    const target = toDns ? (configData.dns.rules ||= []) : (configData.route.rules ||= []); const item = buildSyncedRule(ruleSyncModal.sourceRule, ruleSyncModal.direction, ruleSyncModal);
    if (ruleSyncModal.mode === "overwrite") { if (ruleSyncModal.targetIndex < 0 || ruleSyncModal.targetIndex >= target.length) { ruleSyncModal.error = "请选择需要覆盖的目标规则条目"; return; } target[ruleSyncModal.targetIndex] = item; showToast(`已成功覆盖 ${toDns ? "DNS" : "路由"} 规则 #${ruleSyncModal.targetIndex + 1}`, "success"); }
    else { target.push(item); showToast(`已成功同步并新建至 ${toDns ? "DNS" : "路由"} 规则列表 (共 ${target.length} 条)`, "success"); }
    ruleSyncModal.show = false;
  };
  return { ruleSyncModal, openSyncModal, confirmSyncRule, getRuleSummaryText };
};
