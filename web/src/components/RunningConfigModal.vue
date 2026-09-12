<script setup>
import { nextTick, ref, watch } from "vue";

const logConsoleRef = ref(null);

const scrollToLogBottom = async () => {
  await nextTick();
  if (logConsoleRef.value) {
    logConsoleRef.value.scrollTop = logConsoleRef.value.scrollHeight;
  }
};

const props = defineProps({
  runningConfigModal: { type: Object, required: true },
  runningConfig: { type: Object, required: true },
  runningConfigForm: { type: Object, required: true },
  configList: { type: Array, default: () => [] },
  closeRunningConfigModal: { type: Function, required: true },
  copyLogConsole: { type: Function, required: true },
  saveRunningConfigSettings: { type: Function, required: true },
});

watch(
  () => [props.runningConfigModal.viewMode, props.runningConfigModal.logs || []],
  ([viewMode]) => {
    if (viewMode === "log") {
      void scrollToLogBottom();
    }
  },
  { deep: true },
);

</script>

<template>
<!-- Running Config Settings Modal -->
<div
  class="modal"
  :class="{ active: runningConfigModal.show }"
  @click.self="closeRunningConfigModal"
>
  <div
    class="modal-card"
    :style="{
      maxWidth: runningConfigModal.viewMode === 'log' ? '640px' : '540px',
      width: '90%',
      transition: 'max-width 0.25s ease',
    }"
  >
    <div class="modal-header">
      <span v-if="runningConfigModal.viewMode === 'form'">⚙️ 运行设置</span>
      <span v-else>📋 运行配置更新日志</span>
      <button
        class="close-btn"
        style="
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
        "
        :disabled="runningConfigModal.saving"
        @click="closeRunningConfigModal"
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <div class="modal-body">
      <!-- Mode 1: Form View -->
      <div
        v-if="runningConfigModal.viewMode === 'form'"
        style="display: flex; flex-direction: column; gap: 1rem"
      >
        <!-- Kernel missing warning -->
        <div
          v-if="!runningConfig.kernel_installed"
          style="
            padding: 0.75rem 1rem;
            border-radius: 8px;
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.25);
            font-size: 0.85rem;
            line-height: 1.5;
            color: #ef4444;
            display: flex;
            align-items: center;
            gap: 0.5rem;
          "
        >
          <span>⚠️</span>
          <div>
            <strong>未检测到 sing-box 内核:</strong>
            <span>
              系统必须安装 sing-box 内核才能启动服务。请前往
              <a
                href="#dashboard"
                style="
                  color: inherit;
                  text-decoration: underline;
                  font-weight: 600;
                "
                >仪表盘</a
              >
              一键下载安装内核。</span
            >
          </div>
        </div>

        <div class="input-group">
          <label
            style="font-weight: 600; margin-bottom: 0.35rem; display: block"
            >选择运行配置模板</label
          >
          <select
            v-model="runningConfigForm.config_id"
            class="input-control"
            style="width: 100%"
          >
            <option :value="null">-- 请选择一个配置 --</option>
            <option
              v-for="item in configList"
              :key="item.id"
              :value="item.id"
            >
              #{{ item.id }} - {{ item.detail || "未命名配置" }}
            </option>
          </select>
        </div>

        <!-- Sing-Box core service description -->
        <div
          style="
            padding: 0.75rem;
            border-radius: 8px;
            background: rgba(99, 102, 241, 0.08);
            border: 1px solid rgba(99, 102, 241, 0.2);
            font-size: 0.85rem;
            line-height: 1.5;
            color: var(--text-main);
          "
        >
          <div>🚀 <strong>sing-box 核心服务模式说明:</strong></div>
          <div style="color: var(--text-muted); margin-top: 0.25rem">
            Subout 统一基于 sing-box
            官方核心内核拉起、重载并维护本地服务进程。全平台（Linux /
            Windows / macOS）操作体验一致，免去配置外部命令行与权限提升。
          </div>
        </div>
      </div>

      <!-- Mode 2: Execution Log View -->
      <div v-else class="execution-log-view">
        <!-- Log Status Banner -->
        <div class="log-status-banner" :class="runningConfigModal.status">
          <div
            v-if="runningConfigModal.status === 'running'"
            class="flex items-center gap-2"
          >
            <span class="spinner"></span>
            <strong>正在执行运行配置更新，请稍候...</strong>
          </div>
          <div
            v-else-if="runningConfigModal.status === 'success'"
            class="flex items-center gap-2"
          >
            <span>🟢</span>
            <strong>{{
              runningConfigModal.message ||
              "配置已被覆盖更新，重启程序完成！"
            }}</strong>
          </div>
          <div
            v-else-if="runningConfigModal.status === 'failed'"
            class="flex items-center gap-2"
          >
            <span>🔴</span>
            <strong>{{
              runningConfigModal.message ||
              "更新步骤中断，请参考红色日志信息"
            }}</strong>
          </div>
        </div>

        <!-- Terminal Window -->
        <div class="terminal-container">
          <div class="terminal-header">
            <div class="terminal-dots">
              <span class="dot red"></span>
              <span class="dot yellow"></span>
              <span class="dot green"></span>
            </div>
            <span class="terminal-title">singbox-deployment.log</span>
            <button
              v-if="runningConfigModal.logs.length > 0"
              class="btn-copy-log"
              type="button"
              title="复制日志"
              @click="copyLogConsole"
            >
              📋 复制日志
            </button>
          </div>

          <div ref="logConsoleRef" class="terminal-body">
            <div
              v-for="(item, idx) in runningConfigModal.logs"
              :key="idx"
              class="log-entry"
              :class="item.status"
            >
              <span class="log-time">[{{ item.timestamp }}]</span>
              <span class="log-tag" :class="item.status"
                >[{{ item.step }}]</span
              >
              <span class="log-msg">{{ item.message }}</span>
            </div>
            <div
              v-if="runningConfigModal.logs.length === 0"
              class="log-empty"
            >
              日志初始化中...
            </div>
          </div>
        </div>

        <!-- Command Output Box (stdout/stderr) -->
        <div
          v-if="runningConfigModal.commandOutput"
          class="command-output-box"
        >
          <div class="command-output-title">
            重启命令输出 (stdout/stderr):
          </div>
          <pre class="command-output-text">{{
            runningConfigModal.commandOutput
          }}</pre>
        </div>
      </div>
    </div>
    <!-- End of modal-body -->

    <!-- Modal Footer -->
    <div class="modal-footer">
      <!-- Form Mode Footers -->
      <template v-if="runningConfigModal.viewMode === 'form'">
        <button
          class="btn btn-secondary"
          :disabled="runningConfigModal.saving"
          @click="closeRunningConfigModal"
        >
          取消
        </button>
        <button
          class="btn btn-secondary"
          :disabled="runningConfigModal.saving"
          style="background: rgba(255, 255, 255, 0.05)"
          @click="saveRunningConfigSettings(false)"
        >
          💾 仅保存设置
        </button>
        <button
          class="btn btn-primary"
          :disabled="runningConfigModal.saving"
          @click="saveRunningConfigSettings(true)"
        >
          ⚡ 更新
        </button>
      </template>

      <!-- Log Mode Footers -->
      <template v-else>
        <button
          v-if="runningConfigModal.status === 'running'"
          class="btn btn-secondary"
          disabled
        >
          ⌛ 更新执行中...
        </button>
        <template v-else-if="runningConfigModal.status === 'success'">
          <button
            class="btn btn-secondary"
            @click="runningConfigModal.viewMode = 'form'"
          >
            ‹ 返回设置
          </button>
          <button class="btn btn-primary" @click="closeRunningConfigModal">
            ✔ 完成并关闭
          </button>
        </template>
        <template v-else-if="runningConfigModal.status === 'failed'">
          <button
            class="btn btn-secondary"
            @click="runningConfigModal.viewMode = 'form'"
          >
            ‹ 修改设置
          </button>
          <button
            class="btn btn-danger"
            @click="saveRunningConfigSettings(true)"
          >
            🔄 重新重试
          </button>
          <button
            class="btn btn-secondary"
            @click="closeRunningConfigModal"
          >
            关闭
          </button>
        </template>
      </template>
    </div>
  </div>
</div>
</template>

<style scoped>
/* Execution Log Terminal Modal Styles */
.log-status-banner {
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 0.9rem;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.log-status-banner.running {
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: #3b82f6;
}

.log-status-banner.success {
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #10b981;
}

.log-status-banner.failed {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(59, 130, 246, 0.3);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.terminal-container {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.4);
}

.terminal-header {
  background: #1e293b;
  padding: 0.4rem 0.75rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #334155;
}

.terminal-dots {
  display: flex;
  align-items: center;
  gap: 6px;
}

.terminal-dots .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.terminal-dots .dot.red {
  background: #ff5f56;
}

.terminal-dots .dot.yellow {
  background: #ffbd2e;
}

.terminal-dots .dot.green {
  background: #27c93f;
}

.terminal-title {
  color: #94a3b8;
  font-family: var(--font-mono, monospace);
  font-size: 0.78rem;
  letter-spacing: 0.5px;
}

.btn-copy-log {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #cbd5e1;
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-copy-log:hover {
  background: rgba(255, 255, 255, 0.18);
  color: #ffffff;
}

.terminal-body {
  padding: 0.75rem 1rem;
  max-height: 280px;
  min-height: 140px;
  overflow-y: auto;
  font-family: var(--font-mono, monospace);
  font-size: 0.82rem;
  line-height: 1.6;
}

.log-entry {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
  word-break: break-all;
}

.log-time {
  color: #64748b;
  flex-shrink: 0;
}

.log-tag {
  font-weight: 600;
  padding: 0 4px;
  border-radius: 3px;
  font-size: 0.75rem;
  flex-shrink: 0;
}

.log-tag.info {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
}

.log-tag.success {
  background: rgba(74, 222, 128, 0.15);
  color: #4ade80;
}

.log-tag.error {
  background: rgba(248, 113, 113, 0.15);
  color: #f87171;
}

.log-tag.warn {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
}

.log-entry.success .log-msg {
  color: #4ade80;
}

.log-entry.error .log-msg {
  color: #f87171;
  font-weight: 600;
}

.log-entry.warn .log-msg {
  color: #fbbf24;
}

.log-entry.info .log-msg {
  color: #e2e8f0;
}

.log-empty {
  color: #64748b;
  text-align: center;
  padding: 2rem 0;
}

.command-output-box {
  margin-top: 0.75rem;
  background: #020617;
  border: 1px solid #1e293b;
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
}

.command-output-title {
  color: #94a3b8;
  font-size: 0.78rem;
  margin-bottom: 0.35rem;
  font-weight: 600;
}

.command-output-text {
  color: #e2e8f0;
  font-family: var(--font-mono, monospace);
  font-size: 0.78rem;
  margin: 0;
  white-space: pre-wrap;
  max-height: 120px;
  overflow-y: auto;
}

</style>
