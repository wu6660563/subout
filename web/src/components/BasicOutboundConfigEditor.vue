<template>
                  <!-- 1. 基础出站卡片 -->
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
                          基础出站连接
                        </h3>
                        <p
                          style="
                            margin: 4px 0 0 0;
                            color: var(--text-muted);
                            font-size: 0.85rem;
                          "
                        >
                          系统内置的基础出站连接，用于直连、阻断和DNS查询
                        </p>
                      </div>
                      <button
                        class="btn btn-secondary"
                        style="
                          padding: 0.35rem 0.75rem;
                          font-size: 0.85rem;
                          display: flex;
                          align-items: center;
                          gap: 0.25rem;
                        "
                        @click="emit('add-basic-outbound')"
                      >
                        + 添加基础出站
                      </button>
                    </div>

                    <div class="outbound-cards-grid">
                      <div
                        v-for="outb in basicOutbounds"
                        :key="outb.tag"
                        class="outbound-card"
                      >
                        <div class="card-header">
                          <div class="flex justify-between items-start">
                            <div>
                              <h4 class="card-title">{{ outb.tag }}</h4>
                              <div class="card-subtitle">
                                {{ getOutboundTypeDisplay(outb.type) }}
                              </div>
                            </div>
                            <div class="card-badges">
                              <span
                                v-if="['direct', 'dns'].includes(outb.type)"
                                class="badge badge-success"
                              >
                                基础
                              </span>
                              <span
                                v-else-if="outb.type === 'block'"
                                class="badge badge-warning"
                              >
                                阻断
                              </span>
                              <span v-else class="badge badge-info">
                                自定义
                              </span>
                            </div>
                          </div>
                        </div>

                        <div class="card-content">
                          <div class="card-details">
                            <div class="detail-item">
                              <span class="detail-label">状态:</span>
                              <span class="detail-value"
                                >系统内置，无需额外配置</span
                              >
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
                        v-if="basicOutbounds.length === 0"
                        class="outbound-empty-state"
                      >
                        <div class="empty-icon">🔌</div>
                        <div class="empty-title">暂无基础出站</div>
                        <div class="empty-description">
                          点击上方按钮添加基础出站连接
                        </div>
                      </div>
                    </div>
                  </div>
</template>

<script setup>
defineProps({
  configData: { type: Object, required: true },
  basicOutbounds: { type: Array, default: () => [] },
});

const emit = defineEmits([
  "add-basic-outbound",
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

