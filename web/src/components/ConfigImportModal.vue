<script setup>
defineProps({
  importModal: { type: Object, required: true },
  confirmImport: { type: Function, required: true },
});
</script>

<template>
  <div class="modal" :class="{ active: importModal.show }">
    <div class="modal-card" style="max-width: 800px; width: 95%">
      <div class="modal-header">
        <span>📥 导入完整 sing-box 配置</span>
        <svg style="cursor: pointer" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" @click="importModal.show = false">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </div>

      <div class="modal-body">
        <div v-if="importModal.error" style="padding: 1rem; background: rgba(239, 68, 68, 0.1); border-radius: 6px; color: var(--danger); margin-bottom: 1rem; font-size: 0.85rem">
          <strong>导入失败:</strong> {{ importModal.error }}
        </div>

        <div>
          <div style="margin-bottom: 1rem; padding: 0.75rem; background: rgba(99, 102, 241, 0.1); border-radius: 6px; border-left: 3px solid var(--primary); font-size: 0.85rem">
            <strong>提示:</strong> 请在下方输入或粘贴完整的 sing-box JSON
            配置文件内容。导入后会填入当前编辑中的配置，需点击「保存配置」才能持久化。
            <br />
            配置与节点池/分流出站组完全解耦——保存后 DB
            变更不会影响本配置，所有出站（含节点与策略组定义）已作为快照内联保存。
          </div>
          <textarea v-model="importModal.content" placeholder="在此粘贴 JSON 配置..." style="width: 100%; min-height: 400px; font-family: var(--font-mono); font-size: 0.85rem; padding: 1rem; background: rgba(0, 0, 0, 0.25); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-main); resize: vertical; outline: none"></textarea>
        </div>
      </div>

      <div class="modal-footer">
        <span v-if="importModal.validating" style="font-size: 0.85rem; color: var(--primary)">⏳ 正在通过 sing-box 校验配置...</span>
        <button type="button" class="btn btn-secondary" :disabled="importModal.validating" @click="importModal.show = false">取消</button>
        <button type="button" class="btn" :disabled="importModal.validating" @click="confirmImport">
          {{ importModal.validating ? "校验中..." : "确认导入" }}
        </button>
      </div>
    </div>
  </div>
</template>
