<template>
  <div class="config-section-mode-editor">
                  <!-- Section Header with Mode Toggle -->
                  <div class="flex justify-between items-center mb-4">
                    <div
                      class="panel-title"
                      style="margin: 0; text-transform: uppercase"
                    >
                      {{ section }} 配置
                    </div>
                    <div class="toggle-group">
                      <button
                        class="btn-toggle"
                        :class="{ active: mode === 'visual' }"
                        @click="emit('set-mode', 'visual')"
                      >
                        可视化
                      </button>
                      <button
                        class="btn-toggle"
                        :class="{ active: mode === 'json' }"
                        @click="emit('set-mode', 'json')"
                      >
                        JSON 源码
                      </button>
                    </div>
                  </div>
    
                  <!-- 1. JSON Source Code Mode -->
                  <div v-show="mode === 'json'">
                    <div class="input-group">
                      <label
                        >RAW JSON 配置 (修改后保存会自动同步回可视化表单)</label
                      >
                      <textarea
                        v-model="rawJson[section]"
                        class="input-control"
                        style="
                          font-family: var(--font-mono);
                          height: 400px;
                          font-size: 0.85rem;
                          background: rgba(0, 0, 0, 0.15);
                        "
                      ></textarea>
                    </div>
                  </div>
    
  </div>
</template>

<script setup>
import { toRef } from "vue";

const props = defineProps({
  section: { type: String, required: true },
  mode: { type: String, required: true },
  rawJson: { type: Object, required: true },
});

const rawJson = toRef(props, "rawJson");

const emit = defineEmits(["set-mode"]);
</script>
