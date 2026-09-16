<template>
                <!-- EXPERIMENTAL VISUAL -->
                <div >
                  <!-- Cache File Section -->
                  <div
                    style="
                      border: 1px solid var(--border-color);
                      padding: 1.25rem;
                      border-radius: 8px;
                      margin-bottom: 1.5rem;
                      background: rgba(255, 255, 255, 0.01);
                    "
                  >
                    <div
                      style="
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                        margin-bottom: 1rem;
                      "
                    >
                      <input
                        id="exp-cache-enabled"
                        v-model="configData.experimental.cache_file.enabled"
                        type="checkbox"
                        style="width: 1.1rem; height: 1.1rem"
                      />
                      <label
                        for="exp-cache-enabled"
                        style="
                          font-weight: 600;
                          cursor: pointer;
                          color: var(--secondary);
                          font-size: 1.1rem;
                        "
                        >本地缓存数据库 (cache_file)</label
                      >
                    </div>
                    <div v-if="configData.experimental.cache_file.enabled">
                      <div class="input-group">
                        <label>缓存文件路径 (如 cache.db)</label>
                        <input
                          v-model="configData.experimental.cache_file.path"
                          type="text"
                          class="input-control"
                          placeholder="cache.db"
                        />
                      </div>
                      <div
                        style="
                          display: grid;
                          grid-template-columns: repeat(
                            auto-fit,
                            minmax(200px, 1fr)
                          );
                          gap: 1rem;
                          margin-top: 1rem;
                        "
                      >
                        <label
                          style="
                            display: flex;
                            align-items: center;
                            gap: 0.5rem;
                            cursor: pointer;
                          "
                        >
                          <input
                            v-model="
                              configData.experimental.cache_file.store_fakeip
                            "
                            type="checkbox"
                          />
                          <span>记录 FakeIP 映射 (store_fakeip)</span>
                        </label>
                        <label
                          style="
                            display: flex;
                            align-items: center;
                            gap: 0.5rem;
                            cursor: pointer;
                          "
                        >
                          <input
                            v-model="
                              configData.experimental.cache_file.store_rdrc
                            "
                            type="checkbox"
                          />
                          <span>记录 RDRC 映射 (store_rdrc)</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <!-- Clash API Section -->
                  <div
                    style="
                      border: 1px solid var(--border-color);
                      padding: 1.25rem;
                      border-radius: 8px;
                      background: rgba(255, 255, 255, 0.01);
                    "
                  >
                    <div
                      style="
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                        margin-bottom: 1rem;
                      "
                    >
                      <input
                        id="exp-clash-enabled"
                        v-model="configData.experimental.clash_api.enabled"
                        type="checkbox"
                        style="width: 1.1rem; height: 1.1rem"
                      />
                      <label
                        for="exp-clash-enabled"
                        style="
                          font-weight: 600;
                          cursor: pointer;
                          color: var(--secondary);
                          font-size: 1.1rem;
                        "
                        >Clash RESTful API 接口 (clash_api)</label
                      >
                    </div>
                    <div
                      v-if="configData.experimental.clash_api.enabled"
                      class="grid-2"
                    >
                      <div class="input-group">
                        <label>REST API 监听地址与端口</label>
                        <input
                          v-model="
                            configData.experimental.clash_api
                              .external_controller
                          "
                          type="text"
                          class="input-control"
                          placeholder="127.0.0.1:9090"
                        />
                      </div>
                      <div class="input-group">
                        <label>API 访问密钥 (Secret)</label>
                        <input
                          v-model="configData.experimental.clash_api.secret"
                          type="text"
                          class="input-control"
                          placeholder="访问密码"
                        />
                      </div>
                      <div class="input-group" style="margin-top: 0.75rem">
                        <label>Clash WebUI 静态文件路径 (external_ui)</label>
                        <input
                          v-model="
                            configData.experimental.clash_api.external_ui
                          "
                          type="text"
                          class="input-control"
                          placeholder="folder/ui"
                        />
                      </div>
                      <div class="input-group" style="margin-top: 0.75rem">
                        <label>默认模式 (default_mode)</label>
                        <select
                          v-model="
                            configData.experimental.clash_api.default_mode
                          "
                          class="input-control"
                        >
                          <option value="rule">规则分流 (rule)</option>
                          <option value="global">全局代理 (global)</option>
                          <option value="direct">全局直连 (direct)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
</template>

<script setup>
defineProps({
  configData: { type: Object, required: true },
});
</script>
