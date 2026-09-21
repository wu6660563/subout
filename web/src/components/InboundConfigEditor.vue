<template>
                <!-- INBOUNDS VISUAL -->
                <div >
                  <div class="visual-section-box">
                    <div class="flex justify-between items-center mb-2">
                      <span class="visual-section-title"
                        >入站连接列表 (inbounds)</span
                      >
                      <button
                        class="btn btn-secondary"
                        style="padding: 0.3rem 0.6rem; font-size: 0.8rem"
                        @click="emit('add-inbound')"
                      >
                        + 添加入站
                      </button>
                    </div>
                    <div class="table-container">
                      <table class="table">
                        <thead>
                          <tr>
                            <th style="width: 25%">Tag</th>
                            <th style="width: 20%">Type</th>
                            <th style="width: 40%">配置详情</th>
                            <th style="text-align: right; width: 140px">
                              操作
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr
                            v-for="(inb, idx) in configData.inbounds"
                            :key="idx"
                          >
                            <td>
                              <input
                                v-model="inb.tag"
                                type="text"
                                class="input-control table-input"
                                style="font-weight: 600"
                                placeholder="tag"
                              />
                            </td>
                            <td>
                              <select
                                v-model="inb.type"
                                class="input-control table-input"
                                @change="emit('inbound-type-change', inb)"
                              >
                                <option value="mixed">mixed</option>
                                <option value="tun">tun</option>
                                <option value="socks">socks</option>
                                <option value="http">http</option>
                                <option value="tproxy">tproxy</option>
                                <option value="redirect">redirect</option>
                              </select>
                            </td>
                            <td>
                              <!-- Tun fields -->
                              <div
                                v-if="inb.type === 'tun'"
                                class="flex flex-col gap-2"
                                style="font-size: 0.8rem; padding: 0.2rem 0"
                              >
                                <div
                                  style="
                                    display: flex;
                                    gap: 0.5rem;
                                    align-items: center;
                                  "
                                >
                                  <span
                                    style="
                                      width: 60px;
                                      color: var(--text-muted);
                                      flex-shrink: 0;
                                      text-align: right;
                                    "
                                    >网卡名:</span
                                  >
                                  <input
                                    v-model="inb.interface_name"
                                    type="text"
                                    class="input-control table-input"
                                    style="
                                      flex: 1;
                                      min-width: 60px;
                                      padding: 0.15rem 0.3rem;
                                    "
                                    :disabled="
                                      isApplePlatform || isWindowsPlatform
                                    "
                                    :placeholder="
                                      isApplePlatform
                                        ? '系统自动分配 (utun)'
                                        : isWindowsPlatform
                                          ? '系统自动分配 (wintun)'
                                          : '网卡名 (tun0)'
                                    "
                                  />
                                  <select
                                    v-model="inb.stack"
                                    class="input-control table-input"
                                    style="width: 85px; padding: 0.15rem 0.3rem"
                                  >
                                    <option value="gvisor">gvisor</option>
                                    <option value="mixed">mixed</option>
                                    <option value="system">system</option>
                                  </select>
                                </div>
                                <div
                                  style="
                                    display: flex;
                                    gap: 1rem;
                                    padding-left: 65px;
                                  "
                                >
                                  <label
                                    style="
                                      display: flex;
                                      align-items: center;
                                      gap: 0.25rem;
                                      cursor: pointer;
                                    "
                                  >
                                    <input
                                      v-model="inb.auto_route"
                                      type="checkbox"
                                    />
                                    <span>自动路由</span>
                                  </label>
                                  <label
                                    style="
                                      display: flex;
                                      align-items: center;
                                      gap: 0.25rem;
                                      cursor: pointer;
                                    "
                                  >
                                    <input
                                      v-model="inb.strict_route"
                                      type="checkbox"
                                    />
                                    <span>严格路由</span>
                                  </label>
                                  <label
                                    :style="{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '0.25rem',
                                      cursor: isLinux
                                        ? 'pointer'
                                        : 'not-allowed',
                                      opacity: isLinux ? 1 : 0.6,
                                    }"
                                    :title="
                                      isLinux
                                        ? '仅支持 Linux 系统'
                                        : '当前系统非 Linux，自动重定向不可用'
                                    "
                                  >
                                    <input
                                      v-model="inb.auto_redirect"
                                      type="checkbox"
                                      :disabled="!isLinux"
                                    />
                                    <span>自动重定向</span>
                                    <span
                                      style="
                                        font-size: 0.75rem;
                                        color: var(--text-muted);
                                        margin-left: 0.15rem;
                                      "
                                      >(仅 Linux)</span
                                    >
                                  </label>
                                </div>
                                <div style="display: flex; gap: 0.5rem; align-items: flex-start">
                                  <span
                                    style="
                                      width: 60px;
                                      color: var(--text-muted);
                                      flex-shrink: 0;
                                      text-align: right;
                                      padding-top: 0.35rem;
                                    "
                                    >接管地址:</span
                                  >
                                  <div style="flex: 1; min-width: 0">
                                    <textarea
                                      :value="Array.isArray(inb.route_address) ? inb.route_address.join('\n') : ''"
                                      class="input-control table-input"
                                      style="width: 100%; min-height: 54px; resize: vertical"
                                      placeholder="203.0.113.0/24&#10;每行或逗号分隔一个 CIDR"
                                      @blur="inb.route_address = $event.target.value.split(/[,\n]/).map((value) => value.trim()).filter(Boolean)"
                                    ></textarea>
                                    <small style="color: var(--text-muted)">
                                      route_address：仅将这些目标网段路由到 TUN；留空则使用默认路由。
                                    </small>
                                  </div>
                                </div>
                                <div style="display: flex; gap: 0.5rem; align-items: flex-start">
                                  <span
                                    style="
                                      width: 60px;
                                      color: var(--text-muted);
                                      flex-shrink: 0;
                                      text-align: right;
                                      padding-top: 0.35rem;
                                    "
                                    >绕过地址:</span
                                  >
                                  <div style="flex: 1; min-width: 0">
                                    <button
                                      type="button"
                                      class="btn btn-secondary"
                                      style="padding: 0.2rem 0.45rem; font-size: 0.75rem; margin-bottom: 0.35rem"
                                      @click="addPrivateBypassPresets(inb)"
                                    >
                                      + 添加常用内网
                                    </button>
                                    <textarea
                                      :value="Array.isArray(inb.route_exclude_address) ? inb.route_exclude_address.join('\n') : ''"
                                      class="input-control table-input"
                                      style="width: 100%; min-height: 54px; resize: vertical"
                                      placeholder="10.16.228.100/32&#10;每行或逗号分隔一个 CIDR"
                                      @blur="inb.route_exclude_address = $event.target.value.split(/[,\n]/).map((value) => value.trim()).filter(Boolean)"
                                    ></textarea>
                                    <small style="color: var(--text-muted)">
                                      route_exclude_address：匹配的目标不进入 TUN，由原进程直接连接。
                                    </small>
                                  </div>
                                </div>
                                <div style="display: flex; gap: 0.5rem; align-items: flex-start">
                                  <span
                                    style="
                                      width: 60px;
                                      color: var(--text-muted);
                                      flex-shrink: 0;
                                      text-align: right;
                                      padding-top: 0.35rem;
                                    "
                                    >TUN DNS:</span
                                  >
                                  <div style="flex: 1; min-width: 0">
                                    <select
                                      v-model="inb.dns_mode"
                                      class="input-control table-input"
                                      style="width: 100%; margin-bottom: 0.35rem"
                                    >
                                      <option value="">自动（sing-box 默认）</option>
                                      <option value="native">native</option>
                                      <option value="hijack">hijack</option>
                                      <option value="disabled">disabled</option>
                                    </select>
                                    <textarea
                                      :value="Array.isArray(inb.dns_address) ? inb.dns_address.join('\n') : ''"
                                      class="input-control table-input"
                                      style="width: 100%; min-height: 54px; resize: vertical"
                                      placeholder="172.19.0.2&#10;每行或逗号分隔一个 DNS 地址"
                                      @blur="inb.dns_address = $event.target.value.split(/[,\n]/).map((value) => value.trim()).filter(Boolean)"
                                    ></textarea>
                                    <small style="color: var(--text-muted)">
                                      指定 dns_address 后，请确认路由规则中已配置 hijack-dns。
                                    </small>
                                  </div>
                                </div>
                              </div>
                              <!-- Regular socket inbounds -->
                              <div
                                v-else
                                style="
                                  display: flex;
                                  gap: 0.5rem;
                                  align-items: center;
                                  padding: 0.2rem 0;
                                  font-size: 0.8rem;
                                "
                              >
                                <span
                                  style="
                                    width: 60px;
                                    color: var(--text-muted);
                                    flex-shrink: 0;
                                    text-align: right;
                                  "
                                  >监听/端口:</span
                                >
                                <input
                                  v-model="inb.listen"
                                  type="text"
                                  class="input-control table-input"
                                  style="flex: 1; min-width: 80px"
                                  placeholder="监听地址"
                                />
                                <input
                                  v-model.number="inb.listen_port"
                                  type="number"
                                  class="input-control table-input"
                                  style="width: 75px"
                                  placeholder="端口"
                                />
                              </div>
                            </td>
                            <td style="text-align: right">
                              <div class="flex gap-1 justify-end">
                                <button
                                  class="btn btn-secondary table-btn"
                                  @click="emit('edit-item', inb, idx)"
                                >
                                  编辑
                                </button>
                                <button
                                  class="btn btn-danger table-btn"
                                  @click="emit('remove-inbound', idx)"
                                >
                                  删除
                                </button>
                              </div>
                            </td>
                          </tr>
                          <tr v-if="configData.inbounds.length === 0">
                            <td
                              colspan="4"
                              style="
                                text-align: center;
                                color: var(--text-muted);
                              "
                            >
                              暂无入站连接配置。
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

</template>

<script setup>
import { addSafePrivateBypassAddresses } from "./tunRouteUtils.js";

defineProps({
  configData: { type: Object, required: true },
  isLinux: { type: Boolean, default: true },
  isApplePlatform: { type: Boolean, default: false },
  isWindowsPlatform: { type: Boolean, default: false },
});

const emit = defineEmits([
  "add-inbound",
  "inbound-type-change",
  "edit-item",
  "remove-inbound",
]);

const addPrivateBypassPresets = (inbound) => {
  inbound.route_exclude_address = addSafePrivateBypassAddresses(
    inbound.route_exclude_address,
    inbound,
  );
};
</script>
