<template>
                  <!-- 3. 代理节点卡片 -->
                  <div class="visual-section-box mb-4">
                    <div class="flex justify-between items-center mb-4">
                      <div>
                        <h3
                          style="
                            margin: 0;
                            font-size: 1.1rem;
                            font-weight: 600;
                            color: var(--text-main);
                          "
                        >
                          代理节点
                        </h3>
                        <p
                          style="
                            margin: 4px 0 0 0;
                            color: var(--text-muted);
                            font-size: 0.85rem;
                          "
                        >
                          VMess、VLESS、Trojan、Shadowsocks等代理协议节点
                        </p>
                      </div>
                      <div class="flex gap-2 items-center">
                        <button
                          v-if="proxyOutbounds.length > 0"
                          class="btn btn-secondary"
                          style="padding: 0.35rem 0.75rem; font-size: 0.85rem"
                          @click="emit('toggle-select-all')"
                        >
                          {{ isAllProxiesSelected ? "取消全选" : "全选" }}
                        </button>
                        <button
                          v-if="selectedProxyTags.length > 0"
                          class="btn btn-danger"
                          style="padding: 0.35rem 0.75rem; font-size: 0.85rem"
                          @click="emit('batch-remove')"
                        >
                          🗑️ 批量删除 ({{ selectedProxyTags.length }})
                        </button>
                        <button
                          class="btn btn-secondary"
                          style="
                            padding: 0.35rem 0.75rem;
                            font-size: 0.85rem;
                            display: flex;
                            align-items: center;
                            gap: 0.25rem;
                          "
                          @click="emit('open-node-pool-import')"
                        >
                          📥 从节点池导入
                        </button>
                        <button
                          class="btn"
                          style="
                            padding: 0.35rem 0.75rem;
                            font-size: 0.85rem;
                            display: flex;
                            align-items: center;
                            gap: 0.25rem;
                          "
                          @click="emit('add-proxy-outbound')"
                        >
                          + 添加代理节点
                        </button>
                      </div>
                    </div>

                    <div class="outbound-cards-grid">
                      <div
                        v-for="outb in proxyOutbounds"
                        :key="outb.tag"
                        class="outbound-card proxy-card"
                        :class="{
                          selected: selectedProxyTags.includes(outb.tag),
                        }"
                      >
                        <div class="card-header">
                          <div class="flex justify-between items-start">
                            <div
                              style="
                                display: flex;
                                align-items: center;
                                gap: 0.6rem;
                              "
                            >
                              <input
                                :checked="selectedProxyTags.includes(outb.tag)"
                                type="checkbox"
                                :value="outb.tag"
                                style="
                                  width: 16px;
                                  height: 16px;
                                  cursor: pointer;
                                  accent-color: var(--primary);
                                  flex-shrink: 0;
                                "
                                @click.stop
                                @change="emit('toggle-proxy-selection', outb.tag, $event.target.checked)"
                              />
                              <div>
                                <h4 class="card-title">{{ outb.tag }}</h4>
                                <div class="card-subtitle">
                                  {{ getProxyTypeDisplay(outb.type) }}
                                </div>
                              </div>
                            </div>
                            <div class="card-badges">
                              <span
                                class="badge"
                                :class="getProtocolBadgeClass(outb.type)"
                              >
                                {{ outb.type }}
                              </span>
                              <span
                                v-if="outb.tls && outb.tls.enabled"
                                class="badge badge-success"
                              >
                                TLS
                              </span>
                              <span
                                v-if="outb.transport && outb.transport.type"
                                class="badge badge-info"
                              >
                                {{ outb.transport.type }}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div class="card-content">
                          <div class="card-details">
                            <div class="detail-item">
                              <span class="detail-label">地址:</span>
                              <span class="detail-value">{{
                                outb.server || "未配置"
                              }}</span>
                            </div>
                            <div class="detail-item">
                              <span class="detail-label">端口:</span>
                              <span class="detail-value">{{
                                outb.port || "未配置"
                              }}</span>
                            </div>
                            <div
                              v-if="
                                ['vless', 'vmess', 'tuic'].includes(
                                  outb.type,
                                ) && outb.uuid
                              "
                              class="detail-item"
                            >
                              <span class="detail-label">UUID:</span>
                              <span class="detail-value"
                                >{{ outb.uuid.substring(0, 8) }}...</span
                              >
                            </div>
                            <div
                              v-if="
                                ['trojan', 'shadowsocks', 'hysteria2'].includes(
                                  outb.type,
                                ) && outb.password
                              "
                              class="detail-item"
                            >
                              <span class="detail-label">密码:</span>
                              <span class="detail-value"
                                >{{ outb.password.substring(0, 8) }}...</span
                              >
                            </div>
                            <div
                              v-if="outb.tls && outb.tls.enabled"
                              class="detail-item"
                            >
                              <span class="detail-label">TLS:</span>
                              <span class="detail-value">{{
                                outb.tls.server_name || outb.server
                              }}</span>
                              <span
                                v-if="outb.tls.insecure"
                                class="badge badge-warning"
                                style="margin-left: 4px"
                              >
                                跳过验证
                              </span>
                            </div>
                          </div>
                        </div>

                        <div class="card-actions">
                          <button
                            class="btn btn-secondary btn-sm"
                            @click="emit('edit-item', outb)">
                            编辑
                          </button>
                          <button
                            class="btn btn-danger btn-sm"
                            @click="emit('remove-outbound', configData.outbounds.findIndex((o) => o.tag === outb.tag))"
                          >
                            删除
                          </button>
                        </div>
                      </div>

                      <div
                        v-if="proxyOutbounds.length === 0"
                        class="outbound-empty-state"
                      >
                        <div class="empty-icon">🌐</div>
                        <div class="empty-title">暂无代理节点</div>
                        <div class="empty-description">
                          添加代理节点或从节点池导入订阅节点
                        </div>
                      </div>
                    </div>
                  </div>
</template>

<script setup>
defineProps({
  configData: { type: Object, required: true },
  proxyOutbounds: { type: Array, default: () => [] },
  selectedProxyTags: { type: Array, default: () => [] },
  isAllProxiesSelected: { type: Boolean, default: false },
});

const emit = defineEmits([
  "toggle-select-all",
  "batch-remove",
  "open-node-pool-import",
  "add-proxy-outbound",
  "toggle-proxy-selection",
  "edit-item",
  "remove-outbound",
]);

const getProxyTypeDisplay = (type) => {
  const typeMap = {
    trojan: "Trojan 代理",
    vless: "VLESS 代理",
    vmess: "VMess 代理",
    shadowsocks: "Shadowsocks",
    wireguard: "WireGuard",
    hysteria2: "Hysteria 2",
    tuic: "TUIC",
  };
  return typeMap[type] || type;
};

const getProtocolBadgeClass = (type) => {
  const badgeClassMap = {
    trojan: "badge-success",
    vless: "badge-info",
    vmess: "badge-primary",
    shadowsocks: "badge-warning",
    wireguard: "badge-secondary",
    hysteria2: "badge-danger",
    tuic: "badge-info",
  };
  return badgeClassMap[type] || "badge-secondary";
};
</script>

