<template>
  <div class="panel fill-height">
    <div class="panel-title">
      <span>已保存的配置版本</span>
    </div>
    <div class="panel-table-wrapper">
      <table>
        <thead>
          <tr>
            <th style="width: 80px">ID</th>
            <th>配置备注 / 名称</th>
            <th style="width: 120px">排序值</th>
            <th>创建时间</th>
            <th>最后更新时间</th>
            <th style="text-align: right; width: 400px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in paginatedConfigs" :key="item.id">
            <td style="font-family: var(--font-mono)">#{{ item.id }}</td>
            <td>
              <strong>{{ item.detail || "未命名配置" }}</strong>
            </td>
            <td class="config-sort-cell">
              <div class="config-sort-control" title="数值越小越靠前">
                <span class="config-sort-prefix">#</span>
                <input
                  v-model.number="item.sort_order"
                  aria-label="配置排序值"
                  class="input-control table-input config-sort-input"
                  type="number"
                  min="0"
                  step="1"
                  @change="$emit('update-sort-order', item)"
                />
                <span class="config-sort-suffix">位</span>
              </div>
            </td>
            <td style="color: var(--text-muted); font-size: 0.85rem">
              {{ item.created_at }}
            </td>
            <td style="color: var(--text-muted); font-size: 0.85rem">
              {{ item.updated_at || item.created_at }}
            </td>
            <td style="text-align: right">
              <div class="flex gap-2" style="justify-content: flex-end">
                <button
                  class="btn btn-secondary"
                  style="padding: 0.4rem 0.8rem; font-size: 0.85rem"
                  title="拉取当前系统最新的节点池和出站组并同步到此配置"
                  @click="$emit('sync-latest-resources', item.id, item.detail)"
                >
                  同步最新资源
                </button>
                <button
                  class="btn btn-secondary"
                  style="padding: 0.4rem 0.8rem; font-size: 0.85rem"
                  @click="$emit('edit', item.id)"
                >
                  编辑配置
                </button>
                <button
                  class="btn btn-secondary"
                  style="padding: 0.4rem 0.8rem; font-size: 0.85rem"
                  title="复制此配置为新记录"
                  @click="$emit('duplicate', item.id)"
                >
                  复制
                </button>
                <button
                  class="btn btn-secondary"
                  style="padding: 0.4rem 0.8rem; font-size: 0.85rem"
                  title="导出配置 JSON 文件"
                  @click="$emit('export', item.id, item.detail)"
                >
                  导出
                </button>
                <button
                  class="btn btn-danger"
                  style="padding: 0.4rem 0.8rem; font-size: 0.85rem"
                  @click="$emit('delete', item.id)"
                >
                  删除
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="configList.length === 0">
            <td colspan="6" style="text-align: center; color: var(--text-muted)">
              暂无保存的配置模板。
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div
      class="flex items-center justify-between"
      style="
        margin-top: 1rem;
        border-top: 1px solid var(--border-color);
        padding-top: 0.75rem;
        flex-shrink: 0;
      "
    >
      <div style="color: var(--text-muted); font-size: 0.85rem">
        显示第
        {{ configList.length > 0 ? (currentPage - 1) * pageSize + 1 : 0 }}
        到 {{ Math.min(currentPage * pageSize, configList.length) }} 条，共
        {{ configList.length }} 条
      </div>
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-1-5">
          <span style="color: var(--text-muted); font-size: 0.85rem">每页</span>
          <select
            :value="pageSize"
            class="input-control"
            style="
              padding: 0.2rem 1.6rem 0.2rem 0.5rem;
              font-size: 0.85rem;
              height: 32px;
              width: 76px;
              margin: 0;
              border-radius: 6px;
            "
            @change="$emit('update:page-size', Number($event.target.value))"
          >
            <option :value="5">5</option>
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
          <span style="color: var(--text-muted); font-size: 0.85rem">条</span>
        </div>
        <div class="flex gap-2">
          <button
            class="btn btn-secondary"
            style="
              padding: 0.35rem 0.75rem;
              font-size: 0.8rem;
              height: 32px;
            "
            type="button"
            :disabled="currentPage === 1"
            @click="$emit('update:current-page', currentPage - 1)"
          >
            上一页
          </button>
          <button
            class="btn btn-secondary"
            style="
              padding: 0.35rem 0.75rem;
              font-size: 0.8rem;
              height: 32px;
            "
            type="button"
            :disabled="currentPage * pageSize >= configList.length"
            @click="$emit('update:current-page', currentPage + 1)"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  configList: { type: Array, default: () => [] },
  paginatedConfigs: { type: Array, default: () => [] },
  currentPage: { type: Number, required: true },
  pageSize: { type: Number, required: true },
});

defineEmits([
  "update-sort-order",
  "sync-latest-resources",
  "edit",
  "duplicate",
  "export",
  "delete",
  "update:page-size",
  "update:current-page",
]);
</script>
