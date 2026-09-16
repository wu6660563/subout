<template>
    <!-- 规则快速同步 Modal -->
    <div
      class="modal"
      :class="{ active: ruleSyncModal.show }"
      @click.self="emit('close')"
    >
      <div class="modal-card" style="max-width: 600px">
        <div class="modal-header">
          <span>
            ⇄ 同步规则
            <span
              style="
                font-size: 0.85rem;
                font-weight: normal;
                color: var(--text-muted);
                margin-left: 0.5rem;
              "
            >
              ({{
                ruleSyncModal.direction === "route_to_dns"
                  ? "路由规则 ➔ DNS 规则"
                  : "DNS 规则 ➔ 路由规则"
              }})
            </span>
          </span>
          <svg
            style="cursor: pointer"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            @click="emit('close')"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
        <div class="modal-body">
          <div
            v-if="ruleSyncModal.error"
            class="alert alert-danger mb-3"
            style="padding: 0.5rem 0.75rem; font-size: 0.85rem"
          >
            {{ ruleSyncModal.error }}
          </div>

          <!-- 源规则预览信息 -->
          <div
            class="panel"
            style="
              padding: 0.75rem 1rem;
              margin-bottom: 1rem;
              background: rgba(255, 255, 255, 0.03);
              border: 1px dashed var(--border-color);
            "
          >
            <div
              style="
                font-size: 0.82rem;
                color: var(--text-muted);
                margin-bottom: 0.35rem;
              "
            >
              源规则描述特征 (同步时自动保留域名/规则集/端口等共用条件,
              {{
                ruleSyncModal.direction === "route_to_dns"
                  ? "过滤掉仅路由生效的 IP/CIDR"
                  : "同步至目标路由"
              }})：
            </div>
            <div style="font-size: 0.88rem; font-weight: 500">
              {{
                ruleSyncModal.sourceRule
                  ? getRuleSummaryText(
                      ruleSyncModal.sourceRule,
                      ruleSyncModal.sourceIndex,
                      ruleSyncModal.direction === "route_to_dns"
                        ? "route"
                        : "dns",
                    )
                  : ""
              }}
            </div>
          </div>

          <!-- 同步模式选择：新建 vs 覆盖 -->
          <div class="input-group" style="margin-bottom: 1rem">
            <label>同步目标方式 (Target Action)</label>
            <div style="display: flex; gap: 1rem; margin-top: 0.35rem">
              <label
                style="
                  display: flex;
                  align-items: center;
                  gap: 0.35rem;
                  cursor: pointer;
                "
              >
                <input v-model="ruleSyncModal.mode" type="radio" value="new" />
                <span>➕ 新建全新的规则配置</span>
              </label>
              <label
                style="
                  display: flex;
                  align-items: center;
                  gap: 0.35rem;
                  cursor: pointer;
                "
              >
                <input
                  v-model="ruleSyncModal.mode"
                  type="radio"
                  value="overwrite"
                />
                <span>✏️ 覆盖现有某条规则配置</span>
              </label>
            </div>
          </div>

          <!-- 覆盖目标选择 -->
          <div
            v-if="ruleSyncModal.mode === 'overwrite'"
            class="input-group"
            style="margin-bottom: 1rem"
          >
            <label>请选择需要覆盖的目标规则</label>
            <select
              v-model="ruleSyncModal.targetIndex"
              class="input-control"
              required
            >
              <option :value="-1" disabled>-- 请选择目标规则 --</option>
              <template v-if="ruleSyncModal.direction === 'route_to_dns'">
                <option
                  v-for="(r, i) in configData.dns.rules"
                  :key="i"
                  :value="i"
                >
                  {{ getRuleSummaryText(r, i, "dns") }}
                </option>
              </template>
              <template v-else>
                <option
                  v-for="(r, i) in configData.route.rules"
                  :key="i"
                  :value="i"
                >
                  {{ getRuleSummaryText(r, i, "route") }}
                </option>
              </template>
            </select>
          </div>

          <!-- 目标 DNS 配置 (方向为 route_to_dns) -->
          <div
            v-if="ruleSyncModal.direction === 'route_to_dns'"
            class="grid-2"
            style="margin-bottom: 1rem"
          >
            <div class="input-group">
              <label>目标 DNS 服务器 Tag (server)</label>
              <select
                v-model="ruleSyncModal.targetDnsServer"
                class="input-control"
                required
              >
                <option
                  v-for="srv in configData.dns.servers"
                  :key="srv.tag"
                  :value="srv.tag"
                >
                  {{ srv.tag }}
                </option>
              </select>
            </div>
            <div class="input-group">
              <label>ECS 客户端子网 (client_subnet, 可选)</label>
              <input
                v-model="ruleSyncModal.targetClientSubnet"
                type="text"
                class="input-control"
                placeholder="例如: 223.5.5.0/24"
              />
            </div>
          </div>

          <!-- 目标 Route 配置 (方向为 dns_to_route) -->
          <div
            v-if="ruleSyncModal.direction === 'dns_to_route'"
            class="grid-2"
            style="margin-bottom: 1rem"
          >
            <div class="input-group">
              <label>动作 (Action)</label>
              <select
                v-model="ruleSyncModal.targetRouteAction"
                class="input-control"
              >
                <option value="route">route (路由选择)</option>
                <option value="reject">reject (拦截阻断)</option>
                <option value="hijack-dns">hijack-dns (劫持 DNS)</option>
                <option value="sniff">sniff (流量嗅探)</option>
              </select>
            </div>
            <div
              v-if="ruleSyncModal.targetRouteAction === 'route'"
              class="input-group"
            >
              <label>目标出站 Tag (outbound)</label>
              <select
                v-model="ruleSyncModal.targetRouteOutbound"
                class="input-control"
                required
              >
                <option v-for="tag in allOutboundTags" :key="tag" :value="tag">
                  {{ tag }}
                </option>
              </select>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="emit('close')">
            取消
          </button>
          <button class="btn btn-primary" @click="emit('confirm-sync')">
            确认同步
          </button>
        </div>
      </div>
    </div>

</template>

<script setup>
defineProps({
  ruleSyncModal: { type: Object, required: true },
  configData: { type: Object, required: true },
  allOutboundTags: { type: Array, default: () => [] },
  getRuleSummaryText: { type: Function, required: true },
});

const emit = defineEmits(["close", "confirm-sync"]);
</script>
