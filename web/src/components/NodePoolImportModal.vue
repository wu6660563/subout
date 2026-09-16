<template>
    <!-- Node Pool Import Modal -->
    <div
      class="modal"
      :class="{ active: nodePoolModal.show }"
      @click.self="emit('close')"
    >
      <div class="modal-card" style="max-width: 600px; width: 90%">
        <div class="modal-header">
          <span>📥 从节点池导入节点</span>
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

        <div class="modal-body" style="display: flex; flex-direction: column">
          <div
            style="
              margin-bottom: 0.75rem;
              padding: 0.75rem 1rem;
              background: rgba(99, 102, 241, 0.08);
              border-radius: 8px;
              border-left: 3px solid var(--primary);
              font-size: 0.85rem;
              color: var(--text-muted);
              line-height: 1.4;
            "
          >
            <strong>提示:</strong>
            已在配置中且内容一致的节点将自动置灰；若节点池中节点配置有更新，可勾选进行导入更新。
          </div>

          <div
            style="
              position: relative;
              margin-bottom: 0.5rem;
              display: flex;
              align-items: center;
              gap: 0.5rem;
            "
          >
            <div style="position: relative; flex: 1">
              <input
                v-model="nodePoolModal.searchQuery"
                type="text"
                class="input-control"
                placeholder="🔍 搜索节点 Tag、类型或备注..."
                style="
                  width: 100%;
                  font-size: 0.85rem;
                  height: 36px;
                  padding: 0 2rem 0 0.75rem;
                "
              />
              <button
                v-if="nodePoolModal.searchQuery"
                type="button"
                title="清空搜索"
                style="
                  position: absolute;
                  right: 6px;
                  top: 50%;
                  transform: translateY(-50%);
                  background: none;
                  border: none;
                  cursor: pointer;
                  color: var(--text-muted);
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  padding: 2px;
                  border-radius: 4px;
                "
                @click="emit('clear-search')"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <span
              style="
                font-size: 0.8rem;
                color: var(--text-muted);
                white-space: nowrap;
              "
            >
              可引入/更新: {{ selectableNodePoolNodes.length }} /
              {{ nodePoolModal.nodes.length }}
            </span>
          </div>

          <div
            v-if="nodePoolModal.nodes.length > 0"
            style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              margin-bottom: 0.5rem;
              padding: 0 0.25rem;
              font-size: 0.85rem;
            "
          >
            <div style="display: flex; align-items: center; gap: 0.75rem">
              <label
                style="
                  display: flex;
                  align-items: center;
                  gap: 0.35rem;
                  cursor: pointer;
                  user-select: none;
                  font-weight: 500;
                "
              >
                <input
                  type="checkbox"
                  :checked="isAllNodePoolSelected"
                  :disabled="selectableNodePoolNodes.length === 0"
                  @change="emit('toggle-select-all')"
                />
                <span>全选当前</span>
              </label>
              <div style="display: flex; gap: 0.5rem; color: var(--primary)">
                <a
                  href="javascript:void(0)"
                  style="
                    color: var(--primary);
                    text-decoration: none;
                    font-size: 0.8rem;
                  "
                  @click="emit('toggle-select-all')"
                >
                  {{ isAllNodePoolSelected ? "取消全选" : "全选" }}
                </a>
                <span style="color: var(--border-color)">|</span>
                <a
                  href="javascript:void(0)"
                  style="
                    color: var(--primary);
                    text-decoration: none;
                    font-size: 0.8rem;
                  "
                  @click="emit('invert-selection')"
                >
                  反选
                </a>
                <span style="color: var(--border-color)">|</span>
                <a
                  href="javascript:void(0)"
                  style="
                    color: var(--text-muted);
                    text-decoration: none;
                    font-size: 0.8rem;
                  "
                  @click="emit('clear-selection')"
                >
                  清空
                </a>
              </div>
            </div>
            <div style="color: var(--text-muted); font-size: 0.8rem">
              已选择
              <span style="color: var(--primary); font-weight: 600">{{
                nodePoolModal.selectedIds.length
              }}</span>
              / 可引入 {{ selectableNodePoolNodes.length }} 个
            </div>
          </div>

          <div
            style="
              flex: 1;
              overflow-y: auto;
              border: 1px solid var(--border-color);
              border-radius: 6px;
              padding: 0.5rem;
              background: rgba(0, 0, 0, 0.1);
              max-height: 50vh;
            "
          >
            <div
              v-for="node in filteredNodePoolNodes"
              :key="node.id"
              style="
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0.5rem;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                transition: opacity 0.2s ease;
              "
              :style="{
                opacity: getNodeStatus(node).status === 'unchanged' ? 0.5 : 1,
              }"
            >
              <label
                style="
                  display: flex;
                  align-items: center;
                  gap: 0.5rem;
                  cursor: pointer;
                  flex: 1;
                "
                :style="{
                  cursor:
                    getNodeStatus(node).status === 'unchanged'
                      ? 'not-allowed'
                      : 'pointer',
                }"
              >
                <input
                  v-model="nodePoolModal.selectedIds"
                  type="checkbox"
                  :value="node.id"
                  :disabled="getNodeStatus(node).status === 'unchanged'"
                />
                <div
                  style="
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    flex-wrap: wrap;
                  "
                >
                  <span style="font-weight: 600; color: var(--text-main)">{{
                    node.tag
                  }}</span>
                  <span
                    class="badge"
                    style="
                      font-size: 0.75rem;
                      background: rgba(99, 102, 241, 0.15);
                      color: var(--primary);
                    "
                    >{{ node.node_type }}</span
                  >
                  <span
                    v-if="getNodeStatus(node).status === 'unchanged'"
                    class="badge"
                    style="
                      font-size: 0.7rem;
                      background: rgba(16, 185, 129, 0.12);
                      color: var(--success, #10b981);
                    "
                    >已在配置中</span
                  >
                  <span
                    v-else-if="getNodeStatus(node).status === 'updated'"
                    class="badge"
                    style="
                      font-size: 0.7rem;
                      background: rgba(245, 158, 11, 0.15);
                      color: var(--warning, #f59e0b);
                      border: 1px solid rgba(245, 158, 11, 0.3);
                    "
                    title="节点池中的配置与当前配置中的同名节点不一致，导入将覆盖更新"
                    >🔄 内容有更新</span
                  >
                </div>
              </label>
              <span style="font-size: 0.8rem; color: var(--text-muted)">{{
                node.remarks || "无备注"
              }}</span>
            </div>
            <div
              v-if="nodePoolModal.nodes.length === 0"
              style="
                text-align: center;
                color: var(--text-muted);
                padding: 2rem 0;
              "
            >
              节点池中没有节点，请先在“节点池”中添加或通过订阅获取。
            </div>
          </div>
        </div>
        <!-- End of modal-body -->

        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-secondary"
            @click="emit('close')"
          >
            取消
          </button>
          <button type="button" class="btn" @click="emit('confirm-import')">
            {{ hasSelectedUpdate ? "导入/更新所选节点" : "导入所选节点" }} ({{
              nodePoolModal.selectedIds.length
            }})
          </button>
        </div>
      </div>
    </div>

</template>

<script setup>
defineProps({
  nodePoolModal: { type: Object, required: true },
  filteredNodePoolNodes: { type: Array, default: () => [] },
  selectableNodePoolNodes: { type: Array, default: () => [] },
  hasSelectedUpdate: { type: Boolean, default: false },
  isAllNodePoolSelected: { type: Boolean, default: false },
  getNodeStatus: { type: Function, required: true },
});

const emit = defineEmits([
  "close",
  "clear-search",
  "clear-selection",
  "toggle-select-all",
  "invert-selection",
  "confirm-import",
]);
</script>
