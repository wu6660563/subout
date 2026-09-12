<script setup>
import JsonTreeView from "./JsonTreeView.vue";
defineProps({
  previewModal: { type: Object, required: true },
  copyPreviewToClipboard: { type: Function, required: true },
  exportPreviewFile: { type: Function, required: true },
});
</script>

<template>
<!-- Config Preview Modal -->
<div class="modal" :class="{ active: previewModal.show }">
  <div
    class="modal-card"
    style="
      max-width: 900px;
      width: 95%;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
    "
  >
    <div class="modal-header">
      <span style="display: flex; align-items: center; gap: 0.5rem">
        👁️ 预览生成完整配置 (JSON)
      </span>
      <svg
        style="cursor: pointer"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        @click="previewModal.show = false"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </div>

    <!-- Toolbar / Header inside Modal -->
    <div
      style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
        flex-wrap: wrap;
        gap: 0.5rem;
      "
    >
      <div style="font-size: 0.85rem; color: var(--text-muted)">
        通过本地校验引擎编译后的最终输出，支持缩进、折叠与语法高亮。
      </div>
      <div style="display: flex; gap: 0.5rem">
        <button
          class="btn btn-secondary"
          style="
            padding: 0.35rem 0.75rem;
            font-size: 0.85rem;
            display: inline-flex;
            align-items: center;
            gap: 0.25rem;
          "
          @click="copyPreviewToClipboard"
        >
          📋 复制至剪贴板
        </button>
        <button
          class="btn"
          style="
            padding: 0.35rem 0.75rem;
            font-size: 0.85rem;
            display: inline-flex;
            align-items: center;
            gap: 0.25rem;
          "
          @click="exportPreviewFile"
        >
          📥 导出为文件
        </button>
      </div>
    </div>

    <!-- Modal Scrollable Content -->
    <div style="flex: 1; overflow-y: auto; padding-right: 4px">
      <div
        v-if="previewModal.loading"
        style="
          text-align: center;
          padding: 4rem 0;
          color: var(--text-muted);
        "
      >
        <div style="font-size: 1.5rem; margin-bottom: 0.5rem">⏳</div>
        <div class="mb-2">正在编译并检测配置文件...</div>
        <small
          >系统正在通过本地检测与内置 sing-box 校验引擎完成可行性测试</small
        >
      </div>

      <div
        v-else-if="previewModal.error"
        class="text-danger"
        style="
          padding: 1rem;
          border-left: 3px solid var(--danger);
          background: rgba(239, 68, 68, 0.05);
          border-radius: 6px;
          margin-bottom: 1rem;
          font-size: 0.9rem;
        "
      >
        <strong>校验/编译失败:</strong> {{ previewModal.error }}
      </div>

      <div
        v-else-if="previewModal.jsonObject"
        style="
          padding: 1.25rem;
          background: #282c34;
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.3);
          border-radius: 8px;
          min-height: 450px;
        "
      >
        <json-tree-view :data="previewModal.jsonObject" />
      </div>
    </div>

    <div
      style="
        justify-content: flex-end;
        margin-top: 1rem;
        display: flex;
        gap: 0.5rem;
        border-top: 1px solid var(--border-color);
        padding-top: 1rem;
      "
    >
      <button
        type="button"
        class="btn btn-secondary"
        @click="previewModal.show = false"
      >
        关闭
      </button>
    </div>
  </div>
</div>
</template>
