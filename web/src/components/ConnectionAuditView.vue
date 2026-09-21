<template>
  <div class="view-container connection-audit-view">
    <div class="view-header audit-header">
      <div>
        <h1>连接审计</h1>
        <p>查看 TUN 流量对应的进程、目标、路由和最终代理节点。</p>
        <small class="audit-direct-note">提示：TUN 接管后，即使命中 Direct，连接仍由 sing-box 发起；Direct 仅表示不经代理节点，不能恢复浏览器等原进程的网络身份。</small>
      </div>
      <div class="audit-actions">
        <label class="audit-retention-label">
          保留
          <select v-model.number="retentionMinutes" class="input-control" @change="saveAuditSettings">
            <option v-for="option in RETENTION_OPTIONS" :key="option" :value="option">{{ option }} 分钟</option>
          </select>
        </label>
        <label class="audit-check"><input v-model="recordingEnabled" type="checkbox" @change="saveAuditSettings" /> 记录连接审计日志</label>
        <button class="btn btn-secondary btn-sm" @click="fetchAudit">刷新</button>
        <button class="btn btn-secondary btn-sm" :disabled="tunStatusLoading" @click="loadTunStatus">{{ tunStatusLoading ? '读取中...' : '查看 TUN 状态' }}</button>
        <button class="btn btn-secondary btn-sm" @click="clearAudit">清空日志</button>
      </div>
    </div>

    <div class="audit-status-row">
      <span class="badge badge-success">进程识别：{{ statusText.process }}</span>
      <span class="badge badge-info">日志解析：{{ statusText.logs }}</span>
      <span class="badge" :class="statusText.nodes === '正常' ? 'badge-success' : 'badge-warning'">节点展开：{{ statusText.nodes }}</span>
      <span class="audit-count">{{ filteredEvents.length }} 条结果 / {{ currentEvents.length }} 条当前记录 / {{ retentionMinutes }} 分钟</span>
      <span v-if="earliestExpiry" class="audit-expiry">最早记录约 {{ earliestExpiry }} 到期</span>
    </div>

    <div class="audit-toolbar">
      <input v-model="filters.process" class="input-control" placeholder="检索进程名、PID 或路径" />
      <input v-model="filters.target" class="input-control" placeholder="检索域名或 IP" />
      <input v-model="filters.node" class="input-control" placeholder="检索节点" />
      <select v-model="filters.protocol" class="input-control">
        <option value="">全部协议</option>
        <option value="TCP">TCP</option>
        <option value="UDP">UDP</option>
      </select>
      <label class="audit-check"><input v-model="autoRefresh" type="checkbox" /> 实时刷新</label>
      <select v-model="sortField" class="input-control audit-sort">
        <option value="last_seen">按最后访问</option>
        <option value="first_seen">按首次发现</option>
        <option value="process">按进程</option>
        <option value="node">按节点</option>
      </select>
      <button class="btn btn-secondary btn-sm" @click="toggleSortDirection">{{ sortDirection === 'desc' ? '降序' : '升序' }}</button>
      <button class="btn btn-secondary btn-sm" @click="exportFilteredEvents">导出 JSON</button>
    </div>

    <div class="audit-route-test">
      <strong>路由测试</strong>
      <input v-model="routeTest.domain" class="input-control" placeholder="域名或 IP，例如 gitlab.mtrcloud.cn" />
      <input v-model="routeTest.resolvedIp" class="input-control" placeholder="可选：解析后 IP，例如 10.16.228.100" />
      <input v-model.number="routeTest.port" class="input-control" type="number" placeholder="端口" />
      <input v-model="routeTest.processName" class="input-control" placeholder="可选：进程名，例如 msedge.exe" />
      <input v-model="routeTest.processPath" class="input-control" placeholder="可选：进程路径，例如 C:/Program Files/SDC/browser.exe" />
      <select v-model="routeTest.network" class="input-control"><option value="tcp">TCP</option><option value="udp">UDP</option></select>
      <button class="btn btn-secondary btn-sm" :disabled="routeTestLoading" @click="runRouteTest">{{ routeTestLoading ? '测试中...' : '测试路由' }}</button>
      <span v-if="routeTestError" class="audit-error">{{ routeTestError }}</span>
    </div>
    <div v-if="routeTestResult" class="audit-route-result" :class="routeTestResult.routeKind === 'DIRECT' ? 'direct' : 'proxy'">
      <strong>结果：{{ routeTestResult.routeKind === 'DIRECT' ? 'Direct（直连）' : '代理' }}</strong>
      <span> · {{ routeTestResult.matchedRuleIndex == null ? '未命中规则，使用 final' : `命中规则 #${routeTestResult.matchedRuleIndex + 1}` }} · 出站 {{ routeTestResult.outbound }}</span>
      <small>{{ routeTestResult.directNotice }}</small>
      <small v-if="routeTestTunResult">TUN 接管判断：{{ tunCaptureLabel(routeTestTunResult.status) }} · {{ routeTestTunResult.message }}</small>
      <small v-if="routeTestResult.routeKind === 'DIRECT' && routeTestTunResult?.status !== 'BYPASSED'">专项检查：确认 TUN 是否接管该目标；若已接管，请检查 SDC / WFP / 防火墙是否允许 sing-box.exe 出站。需要保留原进程身份时，将最小目标 CIDR 加入“绕过地址”。</small>
      <small v-if="routeTestDnsResult">DNS 推演：{{ routeTestDnsResult.matchedRuleIndex == null ? '未命中 DNS 规则，使用 final' : `命中 DNS 规则 #${routeTestDnsResult.matchedRuleIndex + 1}` }} · DNS 服务器 {{ routeTestDnsResult.server || '未配置' }}</small>
      <small v-if="routeTestResult.limitations">{{ routeTestResult.limitations }}</small>
      <small v-if="routeTestResult.skippedRules?.length">前序未命中：<span v-for="rule in routeTestResult.skippedRules" :key="rule.index">规则 #{{ rule.index + 1 }}（{{ rule.reasons.join('、') }}） </span></small>
    </div>
    <div v-if="tunStatus || tunStatusError" class="audit-tun-status">
      <strong>当前 TUN 状态</strong>
      <template v-if="tunStatus">
        <span> · 标签：{{ tunStatus.tag || '未命名' }}</span>
        <span> · 地址：{{ formatTunValues(tunStatus.address) }}</span>
        <span> · DNS：{{ tunStatus.dns_mode || 'sing-box 默认' }}{{ tunStatus.dns_address ? `（${formatTunValues(tunStatus.dns_address)}）` : '' }}</span>
        <span> · 接管网段：{{ tunStatus.route_address ? formatTunValues(tunStatus.route_address) : (tunStatus.auto_route === false ? '未配置' : '由 auto_route 自动下发') }}</span>
        <span> · 绕过网段：{{ formatTunValues(tunStatus.route_exclude_address) }}</span>
        <span> · 自动路由：{{ tunStatus.auto_route === false ? '已关闭' : '已开启' }}</span>
        <span> · 严格路由：{{ tunStatus.strict_route ? '已开启' : '未开启' }}</span>
        <small v-if="tunStatusWarnings.length" class="audit-error">配置提示：<span v-for="warning in tunStatusWarnings" :key="warning">{{ warning }} </span></small>
      </template>
      <small v-if="tunStatusError" class="audit-error">{{ tunStatusError }}</small>
    </div>

    <div v-if="errorMessage" class="audit-error">{{ errorMessage }}</div>
    <div v-if="capReached" class="audit-error">内存审计记录已达到上限，系统已自动淘汰最旧记录。</div>
    <div v-if="droppedAuditLines > 0" class="audit-error">审计处理繁忙，已跳过 {{ droppedAuditLines }} 条原始日志。</div>
    <div v-if="newCount > 0" class="audit-new-banner">
      有 {{ newCount }} 条新记录，<button class="btn btn-link" @click="acceptNewRecords">{{ newestFirst ? '点击查看最新' : '查看新增' }}</button>
    </div>

    <div ref="tableWrap" class="audit-table-wrap" @scroll="handleScroll">
      <table class="audit-table">
        <thead>
          <tr>
            <th>最后观察</th><th>进程</th><th>目标</th><th>协议</th><th>路由</th><th>最终节点</th><th>详情</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="event in filteredEvents" :key="eventRowKey(event)">
            <tr :data-audit-event="eventIdentity(event)">
              <td>{{ formatTime(event.last_seen) }}</td>
              <td><span>{{ event.process_name || '未知进程' }}</span><small>PID {{ event.pid ?? '—' }}</small></td>
              <td><span>{{ formatAuditTarget(event) }}</span><small>{{ event.target?.type === 'Domain' ? '域名' : 'IP' }}</small></td>
              <td>{{ event.protocol || '—' }}</td>
              <td><span class="route-pill" :class="String(event.route_kind).toLowerCase()">{{ event.route_kind }}</span></td>
              <td>{{ event.route_kind === 'DIRECT' ? '—' : event.final_node || '节点未知' }}</td>
              <td><button class="btn btn-link btn-sm audit-detail-toggle" @click="toggleDetails(eventRowKey(event))">{{ expanded.has(eventRowKey(event)) ? '收起' : '展开' }}</button></td>
            </tr>
            <tr v-if="expanded.has(eventRowKey(event))" class="audit-detail-row">
              <td colspan="7">
                <div><strong>进程路径：</strong>{{ event.process_path || '未知' }}</div>
                <div><strong>原始目标：</strong>{{ event.target?.type === 'Domain' && event.resolved_ip ? `${event.resolved_ip}:${event.port}` : '—' }}</div>
                <div><strong>域名来源：</strong>{{ event.domain_source || '连接日志' }}（{{ event.domain_confidence || '未标注' }}）</div>
                <div v-if="event.domain_candidates?.length"><strong>候选域名：</strong>{{ event.domain_candidates.join('、') }}（存在歧义，主列表保留 IP）</div>
                <div><strong>命中规则：</strong>{{ formatMatchedRule(event) }}</div>
                <div><strong>出站链路：</strong>{{ formatAuditChain(event) }}</div>
                <div><strong>首次 / 最后观察：</strong>{{ formatTime(event.first_seen) }} / {{ formatTime(event.last_seen) }}</div>
                <div><strong>命中次数：</strong>{{ event.occurrence_count || 1 }}</div>
                <div><strong>最近连接 ID：</strong>{{ event.connection_id || '未知' }}</div>
                <div><strong>原始日志：</strong><code>{{ event.raw_line || '无' }}</code></div>
                <button class="btn btn-secondary btn-sm" @click="copyEvent(event)">复制记录</button>
              </td>
            </tr>
          </template>
          <tr v-if="filteredEvents.length === 0"><td colspan="7" class="audit-empty">暂无匹配的连接审计记录</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { API_BASE, confirmDialog, showToast, token } from "../store.js";
import { RETENTION_OPTIONS, filterAuditEvents, formatAuditChain, formatAuditTarget, formatMatchedRule, normalizeAuditResponse, normalizeRetentionMinutes, sortAuditEvents } from "./connectionAuditUtils.js";
import { simulateDnsRoute, simulateRoute, simulateTunCapture } from "./routeSimulationUtils.js";
import { getTunRiskWarnings } from "./tunStatusUtils.js";

const events = ref([]);
const currentEvents = ref([]);
const retentionMinutes = ref(20);
const recordingEnabled = ref(true);
const autoRefresh = ref(true);
const pageVisible = ref(true);
const errorMessage = ref("");
const newCount = ref(0);
const isNearLatest = ref(true);
const tableWrap = ref(null);
const sortField = ref("last_seen");
const sortDirection = ref("desc");
const expanded = reactive(new Set());
const pendingNewEventIds = reactive(new Set());
const filters = reactive({ process: "", target: "", node: "", route: "", protocol: "" });
const routeTest = reactive({ domain: "", resolvedIp: "", port: 443, network: "tcp", processName: "", processPath: "" });
const routeTestResult = ref(null);
const routeTestDnsResult = ref(null);
const routeTestTunResult = ref(null);
const routeTestError = ref("");
const routeTestLoading = ref(false);
const tunStatus = ref(null);
const tunStatusError = ref("");
const tunStatusLoading = ref(false);
let pollTimer = null;
let auditFetchInFlight = false;

const statusText = reactive({ process: "等待数据", logs: "等待数据", nodes: "等待数据" });
const health = ref(null);
const activeFilters = computed(() => ({ ...filters }));
const filteredEvents = computed(() => sortAuditEvents(filterAuditEvents(events.value, activeFilters.value), sortField.value, sortDirection.value));
const capReached = computed(() => Boolean(health.value?.event_cap_reached));
const droppedAuditLines = computed(() => Number(health.value?.dropped_lines || 0));
const newestFirst = computed(() => sortField.value === "last_seen" && sortDirection.value === "desc");
const tunStatusWarnings = computed(() => getTunRiskWarnings(tunStatus.value));
const earliestExpiry = computed(() => {
  if (!currentEvents.value.length) return "";
  const earliest = Math.min(...currentEvents.value.map((event) => Number(event.last_seen || event.first_seen || 0)).filter(Boolean));
  if (!earliest) return "";
  return formatTime(earliest + retentionMinutes.value * 60);
});

function eventKey(event) {
  return [event.pid, event.process_path, event.target_display, event.port, event.protocol].join("|");
}

function eventRowKey(event) {
  if (Number.isFinite(Number(event.event_id))) return `event-${event.event_id}`;
  return [
    eventKey(event),
    event.first_seen,
    event.route_kind || "",
    event.outbound_tag || "",
    (event.outbound_chain || []).join(">"),
    event.final_node || "",
    event.matched_rule_index ?? "",
    event.matched_rule_summary || "",
  ].join("|");
}

function eventIdentity(event) {
  return Number.isFinite(Number(event.event_id)) ? `event-${event.event_id}` : eventRowKey(event);
}

function formatTime(value) {
  if (!value) return "—";
  return new Date(Number(value) * 1000).toLocaleTimeString();
}

function toggleDetails(key) {
  if (expanded.has(key)) expanded.delete(key); else expanded.add(key);
}

function toggleSortDirection() {
  sortDirection.value = sortDirection.value === "desc" ? "asc" : "desc";
}

async function fetchAudit() {
  if (auditFetchInFlight) return;
  auditFetchInFlight = true;
  try {
    const response = await fetch(`${API_BASE}/api/service/audit`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = normalizeAuditResponse(await response.json());
    const previousKeys = new Set(events.value.map(eventIdentity));
    const incoming = payload.events;
    if (!isNearLatest.value) {
      const newEvents = incoming.filter((event) => !previousKeys.has(eventIdentity(event)));
      newCount.value += newEvents.length;
      newEvents.forEach((event) => pendingNewEventIds.add(eventIdentity(event)));
    }
    events.value = incoming;
    currentEvents.value = payload.current;
    retentionMinutes.value = payload.retentionMinutes;
    if (typeof payload.recordingEnabled === "boolean") recordingEnabled.value = payload.recordingEnabled;
    health.value = payload.health;
    statusText.process = payload.health ? (payload.health.process_identified ? "正常" : "未发现") : (currentEvents.value.some((event) => event.pid != null) ? "正常" : "未发现");
    statusText.logs = payload.health ? (payload.health.logs_parsed ? "正常" : "等待连接") : (incoming.length ? "正常" : "等待连接");
    statusText.nodes = payload.health
      ? (payload.health.node_resolution_degraded ? "部分未知" : (payload.health.nodes_resolved === false && incoming.length ? "未知" : "正常"))
      : (currentEvents.value.some((event) => event.route_kind === "PROXY" && !event.final_node) ? "部分未知" : "正常");
    errorMessage.value = "";
  } catch (error) {
    errorMessage.value = `连接审计读取失败：${error.message}`;
  } finally {
    auditFetchInFlight = false;
  }
}

async function runRouteTest() {
  const domain = routeTest.domain.trim();
  if (!domain) { routeTestError.value = "请输入域名或 IP"; return; }
  routeTestLoading.value = true;
  routeTestError.value = "";
  try {
    const response = await fetch(`${API_BASE}/api/config/generated`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const config = await response.json();
    routeTestResult.value = simulateRoute({ domain, port: routeTest.port, network: routeTest.network, processName: routeTest.processName, processPath: routeTest.processPath }, config);
    routeTestDnsResult.value = simulateDnsRoute(domain, config);
    routeTestTunResult.value = simulateTunCapture({ domain, resolvedIp: routeTest.resolvedIp }, config);
  } catch (error) { routeTestError.value = `路由测试失败：${error.message}`; }
  finally { routeTestLoading.value = false; }
}

function tunCaptureLabel(status) {
  return {
    BYPASSED: "已绕过 TUN",
    CAPTURED: "会进入 TUN",
    LIKELY_CAPTURED: "可能进入 TUN",
    NEEDS_RESOLUTION: "需要解析 IP",
    NO_TUN: "未启用 TUN",
    UNKNOWN: "无法静态确定",
  }[status] || "未知";
}

function formatTunValues(value) {
  if (Array.isArray(value)) return value.length ? value.join("、") : "未配置";
  return value == null || value === "" ? "未配置" : String(value);
}

async function loadTunStatus() {
  tunStatusLoading.value = true;
  tunStatusError.value = "";
  try {
    const response = await fetch(`${API_BASE}/api/config/generated`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const config = await response.json();
    tunStatus.value = (Array.isArray(config.inbounds) ? config.inbounds : []).find((inbound) => inbound?.type === "tun") || null;
    if (!tunStatus.value) tunStatusError.value = "当前生成配置未包含 TUN 入站";
  } catch (error) {
    tunStatus.value = null;
    tunStatusError.value = `读取 TUN 状态失败：${error.message}`;
  } finally {
    tunStatusLoading.value = false;
  }
}

async function loadRetention() {
  try {
    const response = await fetch(`${API_BASE}/api/service/audit/settings`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (response.ok) {
      const settings = await response.json();
      retentionMinutes.value = normalizeRetentionMinutes(settings.retention_minutes);
      if (typeof settings.recording_enabled === "boolean") recordingEnabled.value = settings.recording_enabled;
    }
  } catch { /* audit endpoint reports the visible error */ }
}

async function saveAuditSettings() {
  try {
    const response = await fetch(`${API_BASE}/api/service/audit/settings`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.value}` }, body: JSON.stringify({ retention_minutes: retentionMinutes.value, recording_enabled: recordingEnabled.value }) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const settings = await response.json();
    retentionMinutes.value = normalizeRetentionMinutes(settings.retention_minutes);
    if (typeof settings.recording_enabled === "boolean") recordingEnabled.value = settings.recording_enabled;
    await fetchAudit();
    showToast(recordingEnabled.value ? "连接审计设置已保存" : "连接审计记录已关闭，并已清空内存日志");
  } catch (error) {
    showToast(`保存审计设置失败：${error.message}`, "danger");
  }
}

async function clearAudit() {
  const confirmed = await confirmDialog("确定清空最近的连接审计日志吗？", { title: "清空连接审计", confirmText: "清空", isDanger: true });
  if (!confirmed) return;
  try {
    const response = await fetch(`${API_BASE}/api/service/audit/clear`, { method: "POST", headers: { Authorization: `Bearer ${token.value}` } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    events.value = [];
    currentEvents.value = [];
    expanded.clear();
    pendingNewEventIds.clear();
    health.value = null;
    errorMessage.value = "";
    newCount.value = 0;
    isNearLatest.value = true;
    statusText.process = "等待数据";
    statusText.logs = "等待数据";
    statusText.nodes = "等待数据";
    showToast("连接审计日志已清空");
  } catch (error) {
    showToast(`清空审计日志失败：${error.message}`, "danger");
  }
}

function handleScroll(event) {
  const target = event.currentTarget;
  isNearLatest.value = target.scrollTop < 40;
}

function acceptNewRecords() {
  newCount.value = 0;
  isNearLatest.value = true;
  const newEventIds = new Set(pendingNewEventIds);
  pendingNewEventIds.clear();
  if (tableWrap.value && newestFirst.value) {
    tableWrap.value.scrollTo?.({ top: 0, behavior: "smooth" });
    tableWrap.value.scrollTop = 0;
  } else if (tableWrap.value) {
    nextTick(() => {
      const row = Array.from(tableWrap.value.querySelectorAll("tr[data-audit-event]")).find((element) => newEventIds.has(element.dataset.auditEvent));
      row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }
}

async function copyEvent(event) {
  await navigator.clipboard.writeText(JSON.stringify(event, null, 2));
  showToast("记录已复制");
}

async function exportFilteredEvents() {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(activeFilters.value)) {
    if (value != null && value !== "") query.set(key, String(value));
  }
  query.set("sort_field", sortField.value);
  query.set("sort_direction", sortDirection.value);
  try {
    const response = await fetch(`${API_BASE}/api/service/audit/export?${query}`, { headers: { Authorization: `Bearer ${token.value}` } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = "connection-audit.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    showToast("筛选结果已导出为 JSON 文件");
  } catch (error) {
    showToast(`导出审计记录失败：${error.message}`, "danger");
  }
}

function startPolling() {
  if (!pollTimer) pollTimer = setInterval(fetchAudit, 1500);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

watch([autoRefresh, pageVisible], ([enabled, visible]) => enabled && visible ? startPolling() : stopPolling());

function handleVisibilityChange() {
  pageVisible.value = document.visibilityState !== "hidden";
}

onMounted(async () => {
  document.addEventListener("visibilitychange", handleVisibilityChange);
  await loadRetention();
  await fetchAudit();
  if (pageVisible.value) startPolling();
});
onUnmounted(() => {
  stopPolling();
  document.removeEventListener("visibilitychange", handleVisibilityChange);
});
</script>
