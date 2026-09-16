import { computed, reactive, watch } from "vue";
import {
  applyDomainWizardRule,
  buildSortedOutboundsForSelect,
  calculateOutboundRecommendations,
  findMatchingDomainRouteRule,
  parseDomainWizardInput,
} from "./domainWizardUtils.js";

export const useDomainWizard = ({
  configData, showToast, nodePoolCache, loadNodePoolCache, apiBase, token,
  fetcher = fetch, schedule = (callback) => setTimeout(callback, 50),
}) => {
  const domainWizardModal = reactive({
    show: false, inputText: "", errorMsg: "", detectedType: "", extractedSuffix: "",
    testUrl: "", isTesting: false, testProgress: 0, testTotal: 0, testLogs: [],
    testResults: {}, recommendedOutbound: "", selectedOutbound: "", targetRuleAction: "create",
  });
  watch(() => domainWizardModal.inputText, (inputText) => {
    const input = parseDomainWizardInput(inputText);
    Object.assign(domainWizardModal, {
      errorMsg: input.errorMsg,
      detectedType: input.detectedType,
      extractedSuffix: input.extractedSuffix,
      testUrl: input.testUrl,
    });
  });
  const calculateRecommendations = () => {
    const result = calculateOutboundRecommendations(
      configData.outbounds || [], domainWizardModal.testResults,
    );
    domainWizardModal.testLogs.push(result.recommendationLog);
    domainWizardModal.recommendedOutbound = result.recommendedOutbound;
    domainWizardModal.selectedOutbound = result.recommendedOutbound;
  };
  const sortedOutboundsForSelect = computed(() => buildSortedOutboundsForSelect(
    configData.outbounds || [], domainWizardModal.testResults,
    domainWizardModal.recommendedOutbound,
  ));
  const matchingExistingRule = computed(() =>
    domainWizardModal.selectedOutbound
      ? findMatchingDomainRouteRule(configData.route.rules, domainWizardModal.selectedOutbound)
      : null,
  );
  const confirmApplyDomainWizard = () => {
    if (domainWizardModal.errorMsg) return showToast(domainWizardModal.errorMsg, "warning");
    const input = parseDomainWizardInput(domainWizardModal.inputText);
    const result = applyDomainWizardRule({
      routeRules: configData.route.rules,
      selectedOutbound: domainWizardModal.selectedOutbound,
      domains: input.domains,
      detectedType: domainWizardModal.detectedType,
      extractedSuffix: domainWizardModal.extractedSuffix,
      targetRuleAction: domainWizardModal.targetRuleAction,
    });
    if (result.error) return showToast(result.error, "warning");
    configData.route.rules = result.routeRules;
    const messages = {
      merged: `已成功将域名/后缀 [${result.targetValue}] 合并到已有出站 [${domainWizardModal.selectedOutbound}] 的路由规则中！`,
      "already-exists": `域名/后缀 [${result.targetValue}] 已存在于该出站规则中，无需重复添加。`,
      created: `已成功创建新的分流路由规则，指向出站 [${domainWizardModal.selectedOutbound}]，匹配: ${result.targetValue}`,
    };
    if (result.action === "already-exists") {
      showToast(messages[result.action], "warning");
    } else {
      showToast(messages[result.action]);
    }
    domainWizardModal.show = false;
  };
  const openDomainWizard = () => {
    Object.assign(domainWizardModal, {
      show: true, inputText: "", errorMsg: "", detectedType: "", extractedSuffix: "", testUrl: "",
      isTesting: false, testProgress: 0, testTotal: 0, testLogs: [], testResults: {},
      recommendedOutbound: "", selectedOutbound: "", targetRuleAction: "create",
    });
  };
  const startLatencyTest = async () => {
    if (domainWizardModal.errorMsg) return showToast(domainWizardModal.errorMsg, "warning");
    if (!domainWizardModal.testUrl) return showToast("请输入待测试域名", "warning");
    if (nodePoolCache?.value?.length === 0) {
      domainWizardModal.testLogs.push("正在从后端加载节点池缓存...");
      await loadNodePoolCache?.();
    }
    const proxies = new Set();
    (configData.outbounds || []).forEach((outbound) => {
      if (!["direct", "block", "dns", "selector", "urltest"].includes(outbound.type)) proxies.add(outbound.tag);
      if (["selector", "urltest"].includes(outbound.type)) {
        (outbound.outbounds || []).forEach((tag) => {
          const member = (configData.outbounds || []).find((item) => item.tag === tag);
          if (member && !["direct", "block", "dns", "selector", "urltest"].includes(member.type)) proxies.add(tag);
        });
      }
    });
    const nodeMap = new Map((nodePoolCache?.value || []).map((node) => [node.tag, node]));
    const nodes = [...proxies].map((tag) => nodeMap.get(tag)).filter((node) => node?.id);
    if (!nodes.length) {
      domainWizardModal.testLogs = ["配置的出站或策略组中没有包含有效的代理节点。"];
      return showToast("未找到可测试的代理节点", "warning");
    }
    Object.assign(domainWizardModal, {
      isTesting: true, testProgress: 0, testTotal: nodes.length,
      testLogs: [`开始测试域名: ${domainWizardModal.testUrl}`, `共找到 ${nodes.length} 个相关代理节点待测速...`], testResults: {},
    });
    const url = /^https?:\/\//.test(domainWizardModal.testUrl) ? domainWizardModal.testUrl : `https://${domainWizardModal.testUrl}`;
    const pending = [...nodes];
    const processBatch = async () => {
      if (!pending.length || !domainWizardModal.isTesting) {
        domainWizardModal.isTesting = false; calculateRecommendations(); return;
      }
      await Promise.all(pending.splice(0, 3).map(async (node) => {
        try {
          const response = await fetcher(`${apiBase}/api/nodes/ping`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token?.value || ""}` }, body: JSON.stringify({ ids: [node.id], test_type: "both", target_url: url }) });
          const item = response.ok ? (await response.json())[0] : null;
          const tcp = item?.tcp_latency ?? null; const web = item?.web_latency ?? null;
          const latency = web ?? tcp;
          domainWizardModal.testResults[node.tag] = { tcp, web, latency };
          domainWizardModal.testLogs.push(latency == null ? `[${node.tag}] ${response.ok ? "接口未返回数据" : `接口错误 (状态码: ${response.status})`}` : `[${node.tag}] 网页延迟: ${web ?? "N/A"}ms, TCP 延迟: ${tcp ?? "N/A"}ms`);
        } catch (error) {
          domainWizardModal.testResults[node.tag] = { tcp: null, web: null, latency: null };
          domainWizardModal.testLogs.push(`[${node.tag}] 测试异常: ${error.message || error}`);
        } finally { domainWizardModal.testProgress++; }
      }));
      schedule(processBatch);
    };
    await processBatch();
  };
  return { domainWizardModal, calculateRecommendations, sortedOutboundsForSelect, matchingExistingRule, confirmApplyDomainWizard, openDomainWizard, startLatencyTest };
};
