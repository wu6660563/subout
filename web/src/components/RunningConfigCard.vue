<template>
  <div class="panel" style="margin-bottom: 1.5rem; padding: 1.25rem">
    <div
      style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 1rem;
      "
    >
      <div style="display: flex; align-items: center; gap: 0.75rem">
        <div
          style="
            background: rgba(99, 102, 241, 0.1);
            color: var(--primary);
            padding: 0.5rem;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
          "
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </div>
        <div>
          <h3 style="margin: 0; font-size: 1.1rem; font-weight: 600">
            运行配置
          </h3>
          <p
            style="
              margin: 2px 0 0 0;
              font-size: 0.85rem;
              color: var(--text-muted);
            "
          >
            当前运行配置：<span
              v-if="runningConfig.config_id"
              style="font-weight: 600; color: var(--primary)"
              >#{{ runningConfig.config_id }} ({{ runningConfigName }})</span
            ><span v-else style="color: var(--text-muted)">未设定</span> |
            sing-box 内核：<span
              v-if="runningConfig.kernel_installed"
              style="color: var(--success); font-weight: 500"
              >已就绪
              {{
                runningConfig.kernel_version
                  ? "(" + runningConfig.kernel_version + ")"
                  : ""
              }}</span
            ><span v-else style="color: var(--danger); font-weight: 500"
              >未安装</span
            >
            | 服务状态：<span
              v-if="runningConfig.is_service_running"
              style="color: var(--success); font-weight: 500"
              >运行中</span
            ><span v-else style="color: var(--text-muted)">已停止</span>
          </p>
        </div>
      </div>
      <div>
        <button
          class="btn btn-secondary"
          style="display: flex; align-items: center; gap: 0.25rem"
          @click="emit('open-running-config-modal')"
        >
          ⚙️ 运行设置
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  runningConfig: {
    type: Object,
    required: true,
  },
  runningConfigName: {
    type: String,
    default: "未知配置",
  },
});

const emit = defineEmits(["open-running-config-modal"]);
</script>
