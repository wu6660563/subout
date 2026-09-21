<template>
    <!-- 引入分流出站组 Modal -->
    <div
      class="modal"
      :class="{ active: groupImportModal.show }"
      @click.self="emit('close')"
    >
      <div class="modal-card" style="max-width: 520px; width: 95%">
        <div class="modal-header">
          <span>🔌 引入分流出站组</span>
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
              margin-bottom: 1rem;
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
            引入分流出站组时，将完整展开组设置与所有引用节点的 raw_json
            作为自包含快照写入当前配置。引入后与 DB 解耦，DB
            变更不再影响本配置。
          </div>

          <div
            v-if="outboundGroups.length === 0"
            style="
              text-align: center;
              color: var(--text-muted);
              padding: 2.5rem 1rem;
              background: rgba(255, 255, 255, 0.01);
              border: 1px dashed var(--border-color);
              border-radius: 8px;
              font-size: 0.9rem;
            "
          >
            <div style="font-size: 1.5rem; margin-bottom: 0.5rem">👥</div>
            数据库中暂无分流出站组<br />
            <span
              style="
                font-size: 0.75rem;
                color: var(--text-muted);
                margin-top: 0.25rem;
                display: inline-block;
              "
            >
              请先在「分流出站组」页面创建策略组
            </span>
            <div style="margin-top: 0.75rem">
              <a
                href="#groups"
                class="btn btn-secondary"
                style="font-size: 0.8rem; text-decoration: none"
              >
                前往创建
              </a>
            </div>
          </div>

          <template v-else>
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
                  v-model="groupImportModal.searchQuery"
                  type="text"
                  class="input-control"
                  placeholder="搜索组名..."
                  style="
                    width: 100%;
                    font-size: 0.85rem;
                    height: 36px;
                    padding: 0 2rem 0 0.75rem;
                  "
                />
                <button
                  v-if="groupImportModal.searchQuery"
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
                可引入: {{ availableGroupsToImport.length }} /
                {{ outboundGroups.length }}
              </span>
            </div>

            <div
              v-if="selectableGroupsToImport.length > 0"
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
                    :checked="isAllGroupsSelected"
                    :disabled="selectableGroupsToImport.length === 0"
                    @change="emit('toggle-select-all')"
                  />
                  <span>全选可引入组</span>
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
                    {{ isAllGroupsSelected ? "取消全选" : "全选" }}
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
                  (groupImportModal.selectedTags || []).length
                }}</span>
                / 可引入 {{ selectableGroupsToImport.length }} 个
              </div>
            </div>

            <div
              style="
                flex: 1;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 0.6rem;
                padding-right: 4px;
                max-height: 50vh;
              "
            >
              <div
                v-for="group in filteredGroupsToImport"
                :key="group.tag"
                style="
                  display: flex;
                  flex-direction: column;
                  gap: 0.4rem;
                  padding: 0.85rem 1rem;
                  background: rgba(255, 255, 255, 0.02);
                  border: 1px solid var(--border-color);
                  border-radius: 8px;
                  transition: opacity 0.2s ease;
                "
                :style="{
                  opacity: isGroupImported(group.tag) ? 0.5 : 1,
                }"
              >
                <div
                  style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 0.5rem;
                  "
                >
                  <div style="display: flex; align-items: center; gap: 0.6rem">
                    <input
                      v-if="!isGroupImported(group.tag)"
                      v-model="groupImportModal.selectedTags"
                      type="checkbox"
                      :value="group.tag"
                      style="cursor: pointer; width: 16px; height: 16px"
                    />
                    <div
                      style="display: flex; flex-direction: column; gap: 0.2rem"
                    >
                      <div
                        style="
                          display: flex;
                          align-items: center;
                          gap: 0.5rem;
                          flex-wrap: wrap;
                        "
                      >
                        <strong
                          style="color: var(--primary); font-size: 0.95rem"
                          >{{ group.tag }}</strong
                        >
                        <span
                          class="badge"
                          :class="
                            group.group_type === 'urltest'
                              ? 'badge-info'
                              : 'badge-success'
                          "
                          style="
                            font-size: 0.7rem;
                            padding: 0.1rem 0.4rem;
                            font-weight: 500;
                          "
                        >
                          {{ group.group_type }}
                        </span>
                        <span
                          v-if="isGroupImported(group.tag)"
                          class="badge badge-success"
                          style="font-size: 0.7rem; padding: 0.1rem 0.4rem"
                        >
                          已添加
                        </span>
                      </div>
                      <div style="font-size: 0.8rem; color: var(--text-muted)">
                        节点数:
                        <span
                          style="color: var(--text-main); font-weight: 500"
                          >{{ getGroupNodeCount(group) }}</span
                        >
                        个
                        <span
                          v-if="group.group_type === 'urltest'"
                          style="margin-left: 0.5rem"
                        >
                          | 间隔:
                          <span style="color: var(--text-main)">{{
                            group.interval || "3m"
                          }}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    v-if="!isGroupImported(group.tag)"
                    type="button"
                    class="btn"
                    style="padding: 0.35rem 0.75rem; font-size: 0.8rem"
                    @click="importGroup(group)"
                  >
                    引入
                  </button>
                  <span
                    v-else
                    style="
                      font-size: 0.75rem;
                      color: var(--text-muted);
                      font-style: italic;
                    "
                    >已在配置中</span
                  >
                </div>
                <div
                  v-if="getGroupNodesDisplay(group) !== '无节点'"
                  style="
                    font-size: 0.75rem;
                    color: var(--text-muted);
                    padding-left: 0.5rem;
                    border-left: 2px solid var(--border-color);
                  "
                >
                  {{ getGroupNodesDisplay(group) }}
                </div>
              </div>

              <div
                v-if="filteredGroupsToImport.length === 0"
                style="
                  text-align: center;
                  color: var(--text-muted);
                  padding: 2rem 1rem;
                  background: rgba(255, 255, 255, 0.01);
                  border: 1px dashed var(--border-color);
                  border-radius: 8px;
                  font-size: 0.9rem;
                "
              >
                <div style="font-size: 1.5rem; margin-bottom: 0.5rem">
                  {{ groupImportModal.searchQuery ? "🔍" : "✓" }}
                </div>
                {{
                  groupImportModal.searchQuery
                    ? "没有匹配的分流出站组"
                    : "所有分流出站组都已引入当前配置"
                }}
              </div>
            </div>
          </template>
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
          <button
            v-if="outboundGroups.length > 0"
            type="button"
            class="btn"
            :disabled="(groupImportModal.selectedTags || []).length === 0"
            @click="emit('confirm-import')"
          >
            批量引入所选 ({{ (groupImportModal.selectedTags || []).length }})
          </button>
        </div>
      </div>
    </div>

</template>

<script setup>
import { toRef } from "vue";

const props = defineProps({
  groupImportModal: { type: Object, required: true },
  outboundGroups: { type: Array, default: () => [] },
  availableGroupsToImport: { type: Array, default: () => [] },
  filteredGroupsToImport: { type: Array, default: () => [] },
  selectableGroupsToImport: { type: Array, default: () => [] },
 isAllGroupsSelected: { type: Boolean, default: false },
 isGroupImported: { type: Function, required: true },
 getGroupNodeCount: { type: Function, required: true },
 getGroupNodesDisplay: { type: Function, required: true },
  importGroup: { type: Function, required: true },
});

const groupImportModal = toRef(props, "groupImportModal");

const emit = defineEmits([
  "close",
  "clear-search",
  "clear-selection",
  "toggle-select-all",
  "invert-selection",
  "confirm-import",
]);
</script>
