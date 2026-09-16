<template>
    <!-- 域名分流推荐 (最佳实践) Modal -->
    <div
      class="modal"
      :class="{ active: domainWizardModal.show }"
      @click.self="emit('close')"
    >
      <div class="modal-card" style="max-width: 680px; width: 95%">
        <div class="modal-header">
          <span>⚡ 快捷域名分流推荐 (最佳实践)</span>
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

        <div class="modal-body">
          <!-- Description & Tip -->
          <div
            style="
              margin-bottom: 1.25rem;
              padding: 0.75rem 1rem;
              background: rgba(99, 102, 241, 0.08);
              border-left: 4px solid var(--primary);
              border-radius: 4px;
              font-size: 0.85rem;
              color: var(--text-muted);
              line-height: 1.4;
            "
          >
            <strong>💡 最佳实践建议:</strong>
            输入一个或多个域名。系统将智能分析并测试您的可用节点延迟，然后为您推荐最合适的
            <strong>URLTest 策略组</strong> 或 <strong>特定代理节点</strong>。
          </div>

          <!-- Domains Textarea -->
          <div class="input-group" style="margin-bottom: 1rem">
            <label
              style="font-weight: 600; margin-bottom: 0.4rem; display: block"
            >
              待配置域名 (每行或以逗号/空格分隔一个域名)
            </label>
            <textarea
              v-model="domainWizardModal.inputText"
              class="input-control"
              style="
                height: 100px;
                font-family: var(--font-mono);
                font-size: 0.9rem;
                padding: 0.6rem;
                border-radius: 6px;
                background: rgba(0, 0, 0, 0.2);
                color: var(--text-main);
              "
              placeholder="例如：&#10;www.google.com&#10;drive.google.com"
            ></textarea>
          </div>

          <!-- Analysis Results & Validation Error -->
          <div style="margin-bottom: 1.25rem">
            <div
              v-if="domainWizardModal.errorMsg"
              style="
                padding: 0.75rem 1rem;
                background: rgba(239, 68, 68, 0.1);
                border-radius: 6px;
                color: var(--danger);
                font-size: 0.85rem;
              "
            >
              ⚠️ {{ domainWizardModal.errorMsg }}
            </div>

            <div
              v-else-if="
                domainWizardModal.inputText.trim() &&
                domainWizardModal.detectedType
              "
              style="
                padding: 0.75rem 1rem;
                background: rgba(16, 185, 129, 0.08);
                border: 1px solid rgba(16, 185, 129, 0.2);
                border-radius: 6px;
                font-size: 0.85rem;
                color: var(--text-main);
              "
            >
              <div class="flex items-center gap-2 mb-1">
                <span
                  class="badge badge-success"
                  style="font-size: 0.75rem; padding: 0.1rem 0.4rem"
                >
                  {{
                    domainWizardModal.detectedType === "precise"
                      ? "精确域名"
                      : "范域名 (同后缀)"
                  }}
                </span>
                <span>分析成功</span>
              </div>
              <div
                v-if="domainWizardModal.detectedType === 'precise'"
                style="color: var(--text-muted)"
              >
                写入配置：域名
                <strong>{{ domainWizardModal.testUrl }}</strong> (匹配规则字段:
                <code>domain</code>)
              </div>
              <div
                v-else-if="domainWizardModal.detectedType === 'wildcard'"
                style="color: var(--text-muted)"
              >
                检测到公共域名后缀：<strong style="color: var(--success)">{{
                  domainWizardModal.extractedSuffix
                }}</strong>
                (匹配规则字段: <code>domain_suffix</code>)
                <div
                  style="
                    font-size: 0.8rem;
                    margin-top: 0.25rem;
                    color: var(--text-muted);
                  "
                >
                  测试测速所用域名：<code>{{ domainWizardModal.testUrl }}</code>
                </div>
              </div>
            </div>
          </div>

          <!-- Latency Testing Action and Status -->
          <div
            v-if="
              domainWizardModal.inputText.trim() && !domainWizardModal.errorMsg
            "
            style="
              margin-bottom: 1.25rem;
              padding: 1rem;
              background: rgba(255, 255, 255, 0.02);
              border: 1px solid var(--border-color);
              border-radius: 6px;
            "
          >
            <div class="flex justify-between items-center mb-3">
              <span style="font-size: 0.9rem; font-weight: 600"
                >⚡ 节点延迟智能测试</span
              >
              <button
                class="btn"
                :class="
                  domainWizardModal.isTesting ? 'btn-secondary' : 'btn-primary'
                "
                style="padding: 0.35rem 0.8rem; font-size: 0.85rem"
                :disabled="domainWizardModal.isTesting"
                @click="emit('start-latency-test')"
              >
                {{
                  domainWizardModal.isTesting
                    ? "测试中..."
                    : "开始测试并生成推荐"
                }}
              </button>
            </div>

            <!-- Testing Progress Bar -->
            <div
              v-if="
                domainWizardModal.isTesting ||
                domainWizardModal.testProgress > 0
              "
              style="margin-bottom: 0.75rem"
            >
              <div
                class="flex justify-between"
                style="
                  font-size: 0.8rem;
                  color: var(--text-muted);
                  margin-bottom: 0.3rem;
                "
              >
                <span
                  >测速进度: {{ domainWizardModal.testProgress }} /
                  {{ domainWizardModal.testTotal }}</span
                >
                <span
                  >{{
                    Math.round(
                      (domainWizardModal.testProgress /
                        domainWizardModal.testTotal) *
                        100,
                    )
                  }}%</span
                >
              </div>
              <div
                style="
                  height: 6px;
                  background: rgba(255, 255, 255, 0.05);
                  border-radius: 3px;
                  overflow: hidden;
                "
              >
                <div
                  style="
                    height: 100%;
                    background: linear-gradient(
                      90deg,
                      var(--primary),
                      var(--secondary)
                    );
                    border-radius: 3px;
                    transition: width 0.1s ease;
                  "
                  :style="{
                    width:
                      (domainWizardModal.testProgress /
                        domainWizardModal.testTotal) *
                        100 +
                      '%',
                  }"
                ></div>
              </div>
            </div>

            <!-- Live Logs / Results console -->
            <div
              v-if="domainWizardModal.testLogs.length > 0"
              style="
                height: 110px;
                overflow-y: auto;
                background: #000;
                font-family: var(--font-mono);
                font-size: 0.75rem;
                padding: 0.5rem;
                border-radius: 4px;
                color: #a7f3d0;
                border: 1px solid rgba(255, 255, 255, 0.05);
              "
            >
              <div
                v-for="(log, lIdx) in domainWizardModal.testLogs"
                :key="lIdx"
                style="margin-bottom: 0.2rem"
              >
                {{ log }}
              </div>
            </div>
          </div>

          <!-- Configuration target dropdown and recommendations -->
          <div
            v-if="
              Object.keys(domainWizardModal.testResults).length > 0 ||
              domainWizardModal.recommendedOutbound
            "
            style="
              margin-bottom: 1rem;
              padding: 1rem;
              background: rgba(99, 102, 241, 0.03);
              border: 1px solid rgba(99, 102, 241, 0.1);
              border-radius: 6px;
            "
          >
            <div class="input-group" style="margin-bottom: 1rem">
              <label
                style="font-weight: 600; margin-bottom: 0.4rem; display: block"
                >选择目标出站 (Outbound)</label
              >
              <select
                v-model="domainWizardModal.selectedOutbound"
                class="input-control"
                style="font-weight: 600"
              >
                <option
                  v-for="opt in sortedOutboundsForSelect"
                  :key="opt.tag"
                  :value="opt.tag"
                >
                  {{ opt.isRecommended ? "🔥 [系统推荐] " : ""
                  }}{{ opt.tag }} ({{ opt.latencyText }})
                </option>
              </select>
            </div>

            <!-- Rule Action Choice (Merge/Create) -->
            <div class="input-group">
              <label
                style="font-weight: 600; margin-bottom: 0.4rem; display: block"
                >分流规则写入方式</label
              >
              <div class="flex gap-4" style="margin-top: 0.25rem">
                <label
                  class="flex items-center gap-2"
                  style="cursor: pointer; font-size: 0.85rem"
                >
                  <input
                    v-model="domainWizardModal.targetRuleAction"
                    type="radio"
                    value="append"
                    :disabled="!matchingExistingRule"
                  />
                  <span>合并到已有规则</span>
                  <span
                    v-if="matchingExistingRule"
                    style="color: var(--text-muted); font-size: 0.75rem"
                  >
                    (追加匹配列表)
                  </span>
                  <span
                    v-else
                    style="color: var(--text-muted); font-size: 0.75rem"
                  >
                    (无此出站的简单规则)
                  </span>
                </label>
                <label
                  class="flex items-center gap-2"
                  style="cursor: pointer; font-size: 0.85rem"
                >
                  <input
                    v-model="domainWizardModal.targetRuleAction"
                    type="radio"
                    value="create"
                  />
                  <span>创建新路由规则</span>
                  <span style="color: var(--text-muted); font-size: 0.75rem">
                    (插入在最前，优先级最高)
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button
            type="button"
            class="btn btn-secondary"
            :disabled="domainWizardModal.isTesting"
            @click="emit('close')"
          >
            取消
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="
              domainWizardModal.isTesting ||
              !domainWizardModal.inputText.trim() ||
              domainWizardModal.errorMsg ||
              !domainWizardModal.selectedOutbound
            "
            @click="emit('confirm-apply')"
          >
            确认并写入配置
          </button>
        </div>
      </div>
    </div>
</template>

<script setup>
defineProps({
  domainWizardModal: {
    type: Object,
    required: true,
  },
  sortedOutboundsForSelect: {
    type: Array,
    default: () => [],
  },
  matchingExistingRule: {
    type: [Boolean, Object],
    default: false,
  },
});

const emit = defineEmits([
  "close",
  "start-latency-test",
  "confirm-apply",
]);
</script>
