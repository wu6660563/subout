export const RETENTION_OPTIONS = [10, 20];

export function normalizeRetentionMinutes(value) {
  const minutes = Number(value);
  return RETENTION_OPTIONS.includes(minutes) ? minutes : 20;
}

function proxyAuditEvents(events) {
  return (Array.isArray(events) ? events : []).filter(
    (event) => String(event?.route_kind).toUpperCase() !== "DIRECT",
  );
}

export function normalizeAuditResponse(payload) {
  if (Array.isArray(payload)) {
    const events = proxyAuditEvents(payload);
    return { events, current: events, retentionMinutes: 20, recordingEnabled: true, health: null };
  }
  const events = proxyAuditEvents(payload?.events);
  return {
    events,
    current: proxyAuditEvents(payload?.current ?? payload?.events),
    retentionMinutes: normalizeRetentionMinutes(payload?.retention_minutes),
    recordingEnabled: typeof payload?.recording_enabled === "boolean" ? payload.recording_enabled : true,
    health: payload?.health || null,
  };
}

function targetText(event) {
  const target = event?.target;
  if (typeof event?.target_display === "string" && event.target_display) {
    return event.target_display;
  }
  if (typeof target === "string") return target;
  return target?.value || "";
}

export function filterAuditEvents(events, filters = {}) {
  const processKeyword = String(filters.process || "").trim().toLowerCase();
  const targetKeyword = String(filters.target || "").trim().toLowerCase();
  const route = String(filters.route || "").toUpperCase();
  const protocol = String(filters.protocol || "").toUpperCase();
  const nodeKeyword = String(filters.node || "").trim().toLowerCase();
  const from = Number.isFinite(filters.from) ? filters.from : null;
  const to = Number.isFinite(filters.to) ? filters.to : null;

  return (Array.isArray(events) ? events : []).filter((event) => {
    if (String(event?.route_kind).toUpperCase() === "DIRECT") {
      return false;
    }
    if (processKeyword) {
      const process = `${event?.process_name || ""} ${event?.pid || ""} ${event?.process_path || ""}`.toLowerCase();
      if (!process.includes(processKeyword)) return false;
    }
    if (targetKeyword && !targetText(event).toLowerCase().includes(targetKeyword)) return false;
    if (route && String(event?.route_kind).toUpperCase() !== route) return false;
    if (protocol && String(event?.protocol).toUpperCase() !== protocol) return false;
    if (nodeKeyword) {
      const node = `${event?.final_node || ""} ${(event?.outbound_chain || []).join(" ")}`.toLowerCase();
      if (!node.includes(nodeKeyword)) return false;
    }
    const timestamp = Number(event?.last_seen || event?.first_seen || 0);
    if (from !== null && timestamp < from) return false;
    if (to !== null && timestamp > to) return false;
    return true;
  });
}

export function sortAuditEvents(events, field = "last_seen", direction = "desc") {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...(Array.isArray(events) ? events : [])].sort((a, b) => {
    let left;
    let right;
    if (field === "process") {
      left = `${a?.process_name || ""} ${a?.pid || ""}`.toLowerCase();
      right = `${b?.process_name || ""} ${b?.pid || ""}`.toLowerCase();
    } else if (field === "node") {
      left = (a?.final_node || "").toLowerCase();
      right = (b?.final_node || "").toLowerCase();
    } else if (field === "first_seen" || field === "last_seen") {
      left = Number(a?.[field] || 0);
      right = Number(b?.[field] || 0);
    } else {
      left = targetText(a).toLowerCase();
      right = targetText(b).toLowerCase();
    }
    if (left < right) return -1 * multiplier;
    if (left > right) return 1 * multiplier;
    return 0;
  });
}

export function formatAuditTarget(event) {
  const target = targetText(event);
  const displayTarget = event?.target?.type === "Ip" && target.includes(":") ? `[${target}]` : target;
  return `${displayTarget}:${event?.port || "?"}/${event?.protocol || "?"}`;
}

export function formatAuditChain(event) {
  return Array.isArray(event?.outbound_chain) && event.outbound_chain.length
    ? event.outbound_chain.join(" → ")
    : event?.route_kind === "DIRECT"
      ? "DIRECT"
      : "节点未知";
}

export function formatMatchedRule(event) {
  const index = event?.matched_rule_index != null ? `#${event.matched_rule_index}` : "规则未知";
  const tag = event?.matched_rule_tag ? ` · ${event.matched_rule_tag}` : "";
  const summary = event?.matched_rule_summary ? ` · ${event.matched_rule_summary}` : "";
  return `${index}${tag}${summary}`;
}
