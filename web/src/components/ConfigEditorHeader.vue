<template>
  <div class="config-editor-header-shell">
    <div class="config-header">
      <div class="config-header-left">
        <button
          class="btn btn-secondary"
          style="
            padding: 0.35rem 0.75rem;
            font-size: 0.8rem;
            height: 32px;
            display: inline-flex;
            align-items: center;
            gap: 0.25rem;
            flex-shrink: 0;
          "
          type="button"
          @click="$emit('back')"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          返回列表
        </button>
        <div class="config-header-divider"></div>
        <span class="badge badge-info config-header-badge">编辑中 #{{ currentConfigId }}</span>
        <span
          v-if="isCurrentConfigRunning"
          class="badge"
          style="
            background: rgba(16, 185, 129, 0.15);
            color: #10b981;
            border: 1px solid rgba(16, 185, 129, 0.3);
            font-size: 0.75rem;
            padding: 0.2rem 0.5rem;
            border-radius: 4px;
            display: inline-flex;
            align-items: center;
            gap: 0.3rem;
            font-weight: 500;
          "
          title="当前配置已配置为系统运行配置"
        >
          <span
            style="
              width: 6px;
              height: 6px;
              border-radius: 50%;
              background-color: #10b981;
              display: inline-block;
            "
          ></span>
          运行设置中
        </span>
        <div class="config-remark-container">
          <span class="config-remark-label">配置备注:</span>
          <input
            :value="currentConfigDetail"
            type="text"
            class="input-control config-remark-input"
            placeholder="修改配置备注描述..."
            @input="$emit('update:current-config-detail', $event.target.value)"
          />
        </div>
      </div>

      <div class="config-header-right">
        <button
          class="btn btn-secondary"
          style="padding: 0.5rem 1rem; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.35rem"
          @click="$emit('import')"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          导入完整配置
        </button>
        <button
          class="btn btn-secondary"
          style="padding: 0.5rem 1rem; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.35rem"
          @click="$emit('preview')"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          预览完整配置
        </button>
        <button
          class="btn btn-secondary"
          style="padding: 0.5rem 1rem; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.35rem"
          @click="$emit('save-as-new')"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          另存为新
        </button>
        <button
          class="btn"
          style="padding: 0.5rem 1.25rem; font-size: 0.9rem; font-weight: 600; display: inline-flex; align-items: center; gap: 0.5rem; box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3)"
          @click="$emit('save')"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
          保存配置
        </button>
        <button
          v-if="isCurrentConfigRunning"
          class="btn"
          style="padding: 0.5rem 1.25rem; font-size: 0.9rem; font-weight: 600; display: inline-flex; align-items: center; gap: 0.4rem; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; border: none; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.35)"
          :disabled="runningConfigModal.saving"
          title="保存当前配置并立即同步更新到运行设置"
          @click="$emit('trigger-update')"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          {{ runningConfigModal.saving ? "更新中..." : "更新" }}
        </button>
      </div>
    </div>

    <div class="tabs" style="margin-bottom: 0.25rem; padding-bottom: 0.5rem">
      <div
        v-for="section in sections"
        :key="section"
        class="tab"
        :class="{ active: activeSection === section }"
        @click="$emit('update:active-section', section)"
      >
        {{ section === "log" ? "日志配置" : section === "dns" ? "DNS服务" : section === "inbounds" ? "入站连接 (Inbounds)" : section === "outbounds" ? "出站连接 (Outbounds)" : section === "route" ? "路由规则 (Route)" : "实验功能" }}
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  currentConfigId: { type: [Number, String], default: null },
  currentConfigDetail: { type: String, default: "" },
  activeSection: { type: String, required: true },
  sections: { type: Array, default: () => [] },
  isCurrentConfigRunning: { type: Boolean, default: false },
  runningConfigModal: { type: Object, default: () => ({ saving: false }) },
});

defineEmits([
  "back",
  "import",
  "preview",
  "save-as-new",
  "save",
  "trigger-update",
  "update:current-config-detail",
  "update:active-section",
]);
</script>

<style scoped>
.config-header {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  margin-bottom: 1rem;
}
.config-header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
}
.config-header-divider { height: 18px; width: 1px; background: var(--border-color); flex-shrink: 0; }
.config-header-badge { font-size: 0.75rem; font-weight: 600; padding: 0.25rem 0.5rem; flex-shrink: 0; }
.config-remark-container { display: flex; align-items: center; gap: 0.5rem; flex: 1; max-width: 320px; min-width: 180px; }
.config-remark-label { font-size: 0.8rem; color: var(--text-muted); flex-shrink: 0; white-space: nowrap; }
.config-remark-input { margin: 0; padding: 0.35rem 0.75rem; font-size: 0.85rem; background: rgba(0, 0, 0, 0.2); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-main); height: 32px; width: 100%; transition: all 0.2s ease; }
.config-remark-input:focus { border-color: var(--primary); background: rgba(0, 0, 0, 0.3); box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2); }
.config-header-right { display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0; }
@media (max-width: 1024px) {
  .config-header { flex-direction: column; align-items: stretch; gap: 0.75rem; padding: 0.75rem; }
  .config-header-left { width: 100%; justify-content: flex-start; }
  .config-header-right { width: 100%; justify-content: flex-end; }
}
@media (max-width: 768px) {
  .config-header-left { flex-wrap: wrap; gap: 0.5rem; }
  .config-header-divider { display: none; }
  .config-remark-container { max-width: 100%; width: 100%; flex: none; }
  .config-header-right { justify-content: space-between; width: 100%; gap: 0.5rem; }
  .config-header-right button { flex: 1; padding: 0.5rem 0.5rem; font-size: 0.8rem; min-width: 0; }
}
</style>
