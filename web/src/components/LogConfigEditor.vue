<template>
                <!-- LOG VISUAL -->
                <div >
                  <div class="grid-2">
                    <div class="input-group">
                      <label>日志级别</label>
                      <select
                        v-model="configData.log.level"
                        class="input-control"
                      >
                        <option value="trace">Trace</option>
                        <option value="debug">Debug</option>
                        <option value="info">Info</option>
                        <option value="warn">Warn</option>
                        <option value="error">Error</option>
                        <option value="fatal">Fatal</option>
                        <option value="panic">Panic</option>
                      </select>
                    </div>
                    <div class="input-group">
                      <label
                        >日志输出文件路径
                        (留空输出到标准输出并在面板展示)</label
                      >
                      <input
                        v-model="configData.log.output"
                        type="text"
                        class="input-control"
                        placeholder="例如: sing-box.log 或 /var/log/sing-box.log"
                      />
                    </div>
                  </div>
                  <p
                    style="
                      font-size: 0.8rem;
                      color: var(--text-muted);
                      margin-top: 0.5rem;
                      margin-bottom: 0.5rem;
                    "
                  >
                    💡
                    提示：无论是否指定日志输出文件，核心日志都会实时同步显示在
                    Web 后台「核心日志」页面中，并支持关键字快速筛选。
                  </p>
                  <div
                    class="grid-2"
                    style="margin-top: 0.75rem; margin-bottom: 1rem"
                  >
                    <div class="input-group">
                      <label
                        style="
                          display: flex;
                          align-items: center;
                          gap: 0.5rem;
                          cursor: pointer;
                        "
                      >
                        <input
                          v-model="configData.log.timestamp"
                          type="checkbox"
                          style="width: 1.1rem; height: 1.1rem"
                        />
                        <span>在日志中包含时间戳</span>
                      </label>
                    </div>
                    <div class="input-group">
                      <label
                        style="
                          display: flex;
                          align-items: center;
                          gap: 0.5rem;
                          cursor: pointer;
                        "
                      >
                        <input
                          v-model="configData.log.disabled"
                          type="checkbox"
                          style="width: 1.1rem; height: 1.1rem"
                        />
                        <span>禁用日志输出 (disabled)</span>
                      </label>
                    </div>
                  </div>
                </div>

</template>

<script setup>
defineProps({
  configData: { type: Object, required: true },
});
</script>
