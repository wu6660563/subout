<template>
                  <!-- 2. 策略组卡片 -->
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
                          策略组 (Selector / URLTest)
                        </h3>
                        <p
                          style="
                            margin: 4px 0 0 0;
                            color: var(--text-muted);
                            font-size: 0.85rem;
                          "
                        >
                          手动选择或自动测速的策略组，配置中已自包含
                        </p>
                      </div>
                      <div class="flex gap-2 items-center">
                        <button
                          v-if="groupOutbounds.length > 0"
                          class="btn btn-secondary"
                          style="padding: 0.35rem 0.75rem; font-size: 0.85rem"
                          @click="emit('toggle-select-all')"
                        >
                          {{
                            isAllOutboundGroupsSelected ? "取消全选" : "全选"
                          }}
                        </button>
                        <button
                          v-if="selectedGroupTags.length > 0"
                          class="btn btn-danger"
                          style="padding: 0.35rem 0.75rem; font-size: 0.85rem"
                          @click="emit('batch-remove')"
                        >
                          🗑️ 批量删除 ({{ selectedGroupTags.length }})
                        </button>
                        <a
                          href="#groups"
                          class="btn btn-secondary"
                          style="
                            padding: 0.35rem 0.75rem;
                            font-size: 0.85rem;
                            display: flex;
                            align-items: center;
                            gap: 0.25rem;
                            text-decoration: none;
                          "
                          title="跳转到分流出站组管理页面"
                        >
                          管理出站组
                        </a>
                        <button
                          class="btn"
                          style="
                            padding: 0.35rem 0.75rem;
                            font-size: 0.85rem;
                            display: flex;
                            align-items: center;
                            gap: 0.25rem;
                          "
                          @click="emit('open-group-import')"
                        >
                          🔌 从分流出站组引入
                        </button>
                      </div>
                    </div>

                    <div class="outbound-cards-grid">
                      <div
                        v-for="outb in groupOutbounds"
                        :key="outb.tag"
                        class="outbound-card"
                        :class="{
                          'is-group': true,
                          selected: selectedGroupTags.includes(outb.tag),
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
                                :checked="selectedGroupTags.includes(outb.tag)"
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
                                @change="emit('toggle-group-selection', outb.tag, $event.target.checked)"
                              />
                              <div>
                                <h4 class="card-title">{{ outb.tag }}</h4>
                                <div class="card-subtitle">
                                  {{ getOutboundTypeDisplay(outb.type) }}
                                </div>
                              </div>
                            </div>
                            <div class="card-badges">
                              <span class="badge badge-info">策略组</span>
                              <span
                                v-if="
                                  !Array.isArray(outb.outbounds) ||
                                  outb.outbounds.length === 0
                                "
                                class="badge badge-danger"
                                style="
                                  background: rgba(239, 68, 68, 0.15);
                                  color: #ef4444;
                                  border: 1px solid rgba(239, 68, 68, 0.3);
                                "
                                title="该出站组未包含任何目标节点，会导致 sing-box 校验失败 (missing tags)"
                              >
                                ⚠️ 缺少节点
                              </span>
                            </div>
                          </div>
                        </div>

                        <div class="card-content">
                          <div class="card-details">
                            <div class="detail-item">
                              <span class="detail-label">类型:</span>
                              <span class="detail-value">{{ outb.type }}</span>
                            </div>
                            <div class="detail-item">
                              <span class="detail-label">节点数:</span>
                              <span
                                class="detail-value"
                                :style="{
                                  color:
                                    !Array.isArray(outb.outbounds) ||
                                    outb.outbounds.length === 0
                                      ? '#ef4444'
                                      : '',
                                  fontWeight:
                                    !Array.isArray(outb.outbounds) ||
                                    outb.outbounds.length === 0
                                      ? '600'
                                      : '',
                                }"
                              >
                                {{
                                  Array.isArray(outb.outbounds)
                                    ? outb.outbounds.length
                                    : 0
                                }}
                                个
                                <span
                                  v-if="
                                    !Array.isArray(outb.outbounds) ||
                                    outb.outbounds.length === 0
                                  "
                                >
                                  (⚠️ 无法为空)</span
                                >
                              </span>
                            </div>
                            <div class="detail-item">
                              <span class="detail-label">包含出站:</span>
                              <span class="detail-value">
                                {{
                                  Array.isArray(outb.outbounds)
                                    ? outb.outbounds.slice(0, 3).join(", ")
                                    : "未配置"
                                }}
                                {{
                                  Array.isArray(outb.outbounds) &&
                                  outb.outbounds.length > 3
                                    ? "..."
                                    : ""
                                }}
                              </span>
                            </div>
                            <div
                              v-if="outb.type === 'urltest'"
                              class="detail-item"
                            >
                              <span class="detail-label">测速URL:</span>
                              <span class="detail-value">{{
                                outb.url || "未配置"
                              }}</span>
                            </div>
                            <div
                              v-if="outb.type === 'urltest'"
                              class="detail-item"
                            >
                              <span class="detail-label">测速间隔:</span>
                              <span class="detail-value">{{
                                outb.interval || "未配置"
                              }}</span>
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
                        v-if="groupOutbounds.length === 0"
                        class="outbound-empty-state"
                      >
                        <div class="empty-icon">👥</div>
                        <div class="empty-title">暂无策略组</div>
                        <div class="empty-description">
                          点击「从分流出站组引入」从 DB 导入完整展开的策略组
                        </div>
                      </div>
                    </div>
                  </div>
</template>

<script setup>
defineProps({
  configData: { type: Object, required: true },
  groupOutbounds: { type: Array, default: () => [] },
  selectedGroupTags: { type: Array, default: () => [] },
  isAllOutboundGroupsSelected: { type: Boolean, default: false },
});

const emit = defineEmits([
  "toggle-select-all",
  "batch-remove",
  "open-group-import",
  "toggle-group-selection",
  "edit-item",
  "remove-outbound",
]);

const getOutboundTypeDisplay = (type) => {
  const typeMap = {
    direct: "直连 (Direct)",
    block: "阻断 (Block)",
    dns: "DNS 出站 (DNS)",
    selector: "选择器 (Selector)",
    urltest: "自动测速 (URLTest)",
  };
  return typeMap[type] || type;
};
</script>
