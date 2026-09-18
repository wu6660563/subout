<template>
    <!-- Nested Item JSON/Visual Editor Modal -->
    <div class="modal" :class="{ active: itemModal.show }">
      <div class="modal-card" style="max-width: 700px; width: 90%">
        <div class="modal-header">
          <span>{{ itemModal.title }}</span>
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
          <div
            class="toggle-group"
            style="
              display: flex;
              justify-content: flex-end;
              gap: 0.5rem;
              margin-bottom: 1rem;
              margin-top: 0.5rem;
            "
          >
            <button
              type="button"
              class="btn-toggle"
              :class="{ active: itemModal.mode === 'visual' }"
              @click="emit('set-mode', 'visual')"
            >
              可视化表单
            </button>
            <button
              type="button"
              class="btn-toggle"
              :class="{ active: itemModal.mode === 'json' }"
              @click="emit('set-mode', 'json')"
            >
              JSON 源码
            </button>
          </div>

          <!-- A. Visual Form Mode -->
          <div
            v-if="itemModal.mode === 'visual'"
            style="max-height: 450px; overflow-y: auto; padding-right: 0.5rem"
          >
            <!-- 1. DNS Server fields -->
            <div v-if="itemModal.itemType === 'dns_server'">
              <div class="grid-2">
                <div class="input-group">
                  <label>Tag 名称 (唯一标识)</label>
                  <input
                    v-model="itemModal.itemData.tag"
                    type="text"
                    class="input-control"
                    placeholder="例如: fakeip-dns"
                    required
                  />
                </div>
                <div class="input-group">
                  <label>类型 (Type)</label>
                  <select
                    v-model="itemModal.itemData.type"
                    class="input-control"
                    required
                    @change="emit('dns-server-type-change')"
                  >
                    <option value="fakeip">fakeip (FakeIP 虚假 IP 映射)</option>
                    <option value="local">local (系统本地 DNS)</option>
                    <option value="udp">udp (普通 UDP)</option>
                    <option value="tcp">tcp (普通 TCP)</option>
                    <option value="https">https (DoH 加密)</option>
                    <option value="tls">tls (DoT 加密)</option>
                    <option value="quic">quic (DoQ 加密)</option>
                  </select>
                </div>
              </div>

              <!-- FakeIP specific fields -->
              <div
                v-if="itemModal.itemData.type === 'fakeip'"
                style="
                  margin-top: 1rem;
                  padding: 0.75rem;
                  background: rgba(99, 102, 241, 0.07);
                  border-radius: 8px;
                  border-left: 3px solid var(--primary);
                "
              >
                <div
                  style="
                    font-size: 0.85rem;
                    color: var(--text-muted);
                    margin-bottom: 0.75rem;
                  "
                >
                  <strong style="color: var(--primary)">FakeIP 模式：</strong
                  >为匹配 DNS 规则的域名返回虚假 IP 地址，用于劫持流量送入代理。
                </div>
                <div class="grid-2">
                  <div class="input-group">
                    <label>IPv4 地址池 (inet4_range)</label>
                    <input
                      v-model="itemModal.itemData.inet4_range"
                      type="text"
                      class="input-control"
                      placeholder="198.18.0.0/15"
                    />
                  </div>
                  <div class="input-group">
                    <label>IPv6 地址池 (inet6_range)</label>
                    <input
                      v-model="itemModal.itemData.inet6_range"
                      type="text"
                      class="input-control"
                      placeholder="fc00::/18"
                    />
                  </div>
                </div>
              </div>

              <!-- Normal DNS server fields -->
              <div
                v-if="
                  itemModal.itemData.type !== 'local' &&
                  itemModal.itemData.type !== 'fakeip'
                "
                class="grid-2"
                style="margin-top: 1rem"
              >
                <div class="input-group">
                  <label>服务器地址 (Server)</label>
                  <input
                    v-model="itemModal.itemData.server"
                    type="text"
                    class="input-control"
                    :placeholder="
                      getAddressPlaceholder(itemModal.itemData.type)
                    "
                    required
                  />
                </div>
                <div class="input-group">
                  <label>出站连接 Tag (Detour)</label>
                  <select
                    v-model="itemModal.itemData.detour"
                    class="input-control"
                  >
                    <option value="">-- 无 (直连) --</option>
                    <option
                      v-if="
                        itemModal.itemData.detour &&
                        !allOutboundTags.includes(itemModal.itemData.detour)
                      "
                      :value="itemModal.itemData.detour"
                    >
                      {{ itemModal.itemData.detour }} (当前值)
                    </option>
                    <option
                      v-for="tag in allOutboundTags"
                      :key="tag"
                      :value="tag"
                    >
                      {{ tag }}
                    </option>
                  </select>
                </div>
              </div>
              <div
                v-if="
                  itemModal.itemData.type !== 'local' &&
                  itemModal.itemData.type !== 'fakeip'
                "
                class="grid-2"
                style="margin-top: 1rem"
              >
                <div class="input-group">
                  <label>ECS 客户端子网 (client_subnet)</label>
                  <input
                    v-model="itemModal.itemData.client_subnet"
                    type="text"
                    class="input-control"
                    placeholder="1.1.1.1"
                  />
                </div>
              </div>
            </div>

            <!-- 2. DNS Rule fields -->
            <div v-if="itemModal.itemType === 'dns_rule'">
              <div class="grid-2" style="margin-bottom: 1rem">
                <div class="input-group">
                  <label>规则匹配逻辑 (Rule Logic)</label>
                  <select
                    v-model="itemModal.routeRuleLogic"
                    class="input-control"
                  >
                    <option value="or">
                      逻辑或 OR (满足下方任意非空条件即可 - 建议默认)
                    </option>
                    <option value="standard">
                      默认 AND 逻辑 (需同时满足下方所有非空条件)
                    </option>
                    <option value="and">逻辑与 AND (仅用于特殊嵌套逻辑)</option>
                  </select>
                </div>
                <div class="input-group">
                  <label>目标 DNS 服务器 Tag (server)</label>
                  <select
                    v-model="itemModal.itemData.server"
                    class="input-control"
                    required
                  >
                    <option
                      v-if="
                        itemModal.itemData.server &&
                        !configData.dns.servers.some(
                          (s) => s.tag === itemModal.itemData.server,
                        )
                      "
                      :value="itemModal.itemData.server"
                    >
                      {{ itemModal.itemData.server }} (当前值)
                    </option>
                    <option
                      v-for="srv in configData.dns.servers"
                      :key="srv.tag"
                      :value="srv.tag"
                    >
                      {{ srv.tag }}
                    </option>
                  </select>
                </div>
              </div>

              <!-- Invert and client_subnet -->
              <div class="grid-2" style="margin-bottom: 1rem">
                <div class="input-group">
                  <label>ECS 客户端子网 (client_subnet)</label>
                  <input
                    v-model="itemModal.itemData.client_subnet"
                    type="text"
                    class="input-control"
                    placeholder="例如: 223.5.5.0/24"
                  />
                </div>
                <div
                  class="input-group"
                  style="display: flex; align-items: center; margin-top: 1.5rem"
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
                      v-model="itemModal.itemData.invert"
                      type="checkbox"
                    />
                    <span>反转匹配条件 (invert)</span>
                  </label>
                </div>
              </div>

              <!-- Coexisting condition fields -->
              <div style="display: flex; flex-direction: column; gap: 1rem">
                <div class="input-group">
                  <label>规则集列表 (rule_set, 每行一例)</label>
                  <textarea
                    v-model="itemModal.tempFields.rule_set"
                    class="input-control"
                    style="height: 80px"
                    placeholder="geosite-google&#10;geosite-cn"
                  ></textarea>
                </div>
                <div class="input-group">
                  <label>域名后缀 (domain_suffix, 每行一例)</label>
                  <textarea
                    v-model="itemModal.tempFields.domain_suffix"
                    class="input-control"
                    style="height: 80px"
                    placeholder="google.com&#10;youtube.com"
                  ></textarea>
                </div>
                <div class="input-group">
                  <label>Geosite 规则集名称 (geosite, 每行一例)</label>
                  <textarea
                    v-model="itemModal.tempFields.geosite"
                    class="input-control"
                    style="height: 80px"
                    placeholder="cn&#10;geolocation-!cn"
                  ></textarea>
                </div>
                <div class="input-group">
                  <label>精确域名 (domain, 每行一例)</label>
                  <textarea
                    v-model="itemModal.tempFields.domain"
                    class="input-control"
                    style="height: 80px"
                    placeholder="www.google.com&#10;api.github.com"
                  ></textarea>
                </div>

                <div style="margin-top: 0.5rem; text-align: center">
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    style="padding: 0.25rem 0.5rem; font-size: 0.78rem"
                    @click="emit('toggle-advanced-dns')"
                  >
                    {{
                      showAdvancedDnsFields
                        ? "收起高级匹配条件 ▴"
                        : "展开高级匹配条件 (域名关键字/正则/GeoIP/IP网段/端口等) ▾"
                    }}
                  </button>
                </div>

                <Transition name="collapse">
                  <div
                    v-show="showAdvancedDnsFields"
                    style="
                      border-top: 1px dashed var(--border-color);
                      padding-top: 1rem;
                      display: flex;
                      flex-direction: column;
                      gap: 1rem;
                    "
                  >
                    <div class="input-group">
                      <label>域名关键字 (domain_keyword, 每行一例)</label>
                      <textarea
                        v-model="itemModal.tempFields.domain_keyword"
                        class="input-control"
                        style="height: 80px"
                        placeholder="google&#10;github"
                      ></textarea>
                    </div>
                    <div class="input-group">
                      <label>域名正则表达式 (domain_regex, 每行一例)</label>
                      <textarea
                        v-model="itemModal.tempFields.domain_regex"
                        class="input-control"
                        style="height: 80px"
                        placeholder="^google\..*$"
                      ></textarea>
                    </div>
                    <div class="input-group">
                      <label>GeoIP 规则集 (geoip, 每行一例)</label>
                      <textarea
                        v-model="itemModal.tempFields.geoip"
                        class="input-control"
                        style="height: 80px"
                        placeholder="cn&#10;private"
                      ></textarea>
                    </div>
                    <div class="input-group">
                      <label>IP CIDR 网段 (ip_cidr, 每行一例)</label>
                      <textarea
                        v-model="itemModal.tempFields.ip_cidr"
                        class="input-control"
                        style="height: 80px"
                        placeholder="192.168.1.0/24"
                      ></textarea>
                    </div>
                    <div class="grid-2">
                      <div class="input-group">
                        <label>端口列表 (port, 逗号分隔)</label>
                        <input
                          v-model="itemModal.tempFields.port"
                          type="text"
                          class="input-control"
                          placeholder="53, 80"
                        />
                      </div>
                      <div class="input-group">
                        <label>来源入站连接 (inbound, 逗号分隔)</label>
                        <input
                          v-model="itemModal.tempFields.inbound"
                          type="text"
                          class="input-control"
                          placeholder="mixed-in"
                        />
                      </div>
                    </div>
                    <div class="input-group">
                      <div
                        style="
                          display: flex;
                          justify-content: space-between;
                          align-items: center;
                          margin-bottom: 0.35rem;
                          flex-wrap: wrap;
                          gap: 0.5rem;
                        "
                      >
                        <label style="margin-bottom: 0"
                          >进程名称 (process_name, 每行一例)</label
                        >
                        <div
                          class="preset-badges"
                          style="
                            display: flex;
                            gap: 0.35rem;
                            flex-wrap: wrap;
                            align-items: center;
                          "
                        >
                          <span
                            style="font-size: 0.75rem; color: var(--text-muted)"
                            >快捷点选:</span
                          >
                          <button
                            v-for="b in browserPresets"
                            :key="b.label"
                            type="button"
                            class="btn btn-xs btn-secondary"
                            style="padding: 0.15rem 0.4rem; font-size: 0.75rem"
                            :title="b.title"
                            @click="emit('append-preset-process', b.name)"
                          >
                            {{ b.label }}
                          </button>
                        </div>
                      </div>
                      <textarea
                        v-model="itemModal.tempFields.process_name"
                        class="input-control"
                        style="height: 80px"
                        :placeholder="processNamePlaceholder"
                      ></textarea>
                      <div
                        style="
                          font-size: 0.75rem;
                          color: var(--text-muted);
                          margin-top: 0.25rem;
                        "
                      >
                        {{
                          isApplePlatform
                            ? "提示：填入 macOS 进程名称（例如 Google Chrome、Microsoft Edge、firefox、Safari 等，Chromium 系建议同时包含 Helper），支持多个程序按行分隔。"
                            : isWindowsPlatform
                              ? "提示：填入 Windows 进程可执行文件名（例如 chrome.exe、firefox.exe、msedge.exe 等），支持多个程序按行分隔。"
                              : "提示：填入 Linux 进程可执行文件名（例如 chrome、firefox、msedge 等），支持多个程序按行分隔。"
                        }}
                      </div>
                    </div>
                    <div class="input-group">
                      <label>进程绝对路径 (process_path, 每行一例)</label>
                      <textarea
                        v-model="itemModal.tempFields.process_path"
                        class="input-control"
                        style="height: 80px"
                        :placeholder="processPathPlaceholder"
                      ></textarea>
                    </div>
                    <div class="input-group">
                      <label>进程路径正则 (process_path_regex, 每行一例)</label>
                      <textarea
                        v-model="itemModal.tempFields.process_path_regex"
                        class="input-control"
                        style="height: 80px"
                        placeholder=".*chrome.*&#10;.*firefox.*"
                      ></textarea>
                    </div>
                    <div class="grid-2">
                      <div class="input-group">
                        <label>应用包名 (package_name)</label>
                        <textarea
                          v-model="itemModal.tempFields.package_name"
                          class="input-control"
                          style="height: 60px"
                          placeholder="com.microsoft.emmx"
                        ></textarea>
                      </div>
                      <div class="input-group">
                        <label>运行用户 (user)</label>
                        <textarea
                          v-model="itemModal.tempFields.user"
                          class="input-control"
                          style="height: 60px"
                          placeholder="root"
                        ></textarea>
                      </div>
                    </div>
                  </div>
                </Transition>
              </div>
            </div>

            <!-- 3. Inbound fields -->
            <div v-if="itemModal.itemType === 'inbound'">
              <div class="grid-2">
                <div class="input-group">
                  <label>入站 Tag 名称</label>
                  <input
                    v-model="itemModal.itemData.tag"
                    type="text"
                    class="input-control"
                    placeholder="mixed-in"
                    required
                  />
                </div>
                <div class="input-group">
                  <label>入站协议类型</label>
                  <select
                    v-model="itemModal.itemData.type"
                    class="input-control"
                    required
                    @change="emit('inbound-type-change', itemModal.itemData)"
                  >
                    <option value="mixed">mixed (混合 Socks/HTTP)</option>
                    <option value="tun">tun (虚拟网卡 TUN)</option>
                    <option value="socks">socks</option>
                    <option value="http">http</option>
                    <option value="tproxy">tproxy</option>
                    <option value="redirect">redirect</option>
                  </select>
                </div>
              </div>
              <div
                v-if="itemModal.itemData.type !== 'tun'"
                class="grid-2"
                style="margin-top: 1rem"
              >
                <div class="input-group">
                  <label>监听地址</label>
                  <input
                    v-model="itemModal.itemData.listen"
                    type="text"
                    class="input-control"
                    placeholder="::"
                    required
                  />
                </div>
                <div class="input-group">
                  <label>监听端口</label>
                  <input
                    v-model.number="itemModal.itemData.listen_port"
                    type="number"
                    class="input-control"
                    placeholder="2334"
                    required
                  />
                </div>
              </div>
              <div
                v-if="itemModal.itemData.type === 'tun'"
                style="
                  margin-top: 1rem;
                  border-top: 1px dotted var(--border-color);
                  padding-top: 1rem;
                "
              >
                <div class="input-group" style="margin-bottom: 1rem">
                  <div
                    style="
                      display: flex;
                      align-items: center;
                      justify-content: space-between;
                      gap: 1rem;
                      margin-bottom: 0.5rem;
                    "
                  >
                    <label style="margin-bottom: 0">TUN 地址 (address)</label>
                    <button
                      type="button"
                      class="btn btn-secondary btn-small"
                      @click="itemModal.itemData.address.push('')"
                    >
                      + 添加地址
                    </button>
                  </div>
                  <div
                    v-for="(address, addressIdx) in itemModal.itemData.address"
                    :key="`tun-address-${addressIdx}`"
                    style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem"
                  >
                    <input
                      v-model="itemModal.itemData.address[addressIdx]"
                      type="text"
                      class="input-control"
                      :placeholder="
                        addressIdx === 0 ? '172.19.0.1/30' : 'fd00::1/126'
                      "
                      required
                    />
                    <button
                      type="button"
                      class="btn btn-secondary btn-small"
                      title="删除地址"
                      @click="itemModal.itemData.address.splice(addressIdx, 1)"
                    >
                      删除
                    </button>
                  </div>
                  <small style="color: var(--text-muted)">
                    可同时配置 IPv4 和 IPv6 CIDR 地址，例如
                    172.19.0.1/30、fd00::1/126。
                  </small>
                </div>
                <div class="input-group" style="margin-bottom: 1rem">
                  <label>绕过 TUN 的目标地址 (route_exclude_address)</label>
                  <textarea
                    :value="Array.isArray(itemModal.itemData.route_exclude_address) ? itemModal.itemData.route_exclude_address.join('\n') : ''"
                    class="input-control"
                    style="min-height: 88px; resize: vertical"
                    placeholder="10.16.228.100/32&#10;每行或逗号分隔一个 CIDR"
                    @blur="itemModal.itemData.route_exclude_address = $event.target.value.split(/[,\n]/).map((value) => value.trim()).filter(Boolean)"
                  ></textarea>
                  <small style="color: var(--text-muted)">
                    匹配的流量不进入 TUN，保留原进程网络身份；建议先填写精确地址或最小网段。
                  </small>
                </div>
                <div class="grid-2">
                  <div class="input-group">
                    <label>网卡接口名称 (interface_name)</label>
                    <input
                      v-model="itemModal.itemData.interface_name"
                      type="text"
                      class="input-control"
                      :disabled="isApplePlatform || isWindowsPlatform"
                      :placeholder="
                        isApplePlatform
                          ? '系统自动分配 (utun)'
                          : isWindowsPlatform
                            ? '系统自动分配 (wintun)'
                            : 'tun0'
                      "
                    />
                    <small
                      v-if="isApplePlatform"
                      style="
                        color: var(--text-muted);
                        margin-top: 4px;
                        display: block;
                      "
                    >
                      📌 macOS 虚拟网卡由系统内核自动挂载命名为
                      utun，固定为系统自动分配。
                    </small>
                    <small
                      v-else-if="isWindowsPlatform"
                      style="
                        color: var(--text-muted);
                        margin-top: 4px;
                        display: block;
                      "
                    >
                      📌 Windows Wintun
                      虚拟网卡由系统内核自动挂载命名，固定为系统自动分配。
                    </small>
                  </div>
                  <div class="input-group">
                    <label>网络协议栈 (stack)</label>
                    <select
                      v-model="itemModal.itemData.stack"
                      class="input-control"
                      required
                    >
                      <option value="gvisor">gvisor</option>
                      <option value="mixed">mixed</option>
                      <option value="system">system</option>
                    </select>
                  </div>
                </div>
                <div class="grid-2" style="margin-top: 1rem">
                  <div class="input-group">
                    <label>最大传输单元 (MTU)</label>
                    <input
                      v-model.number="itemModal.itemData.mtu"
                      type="number"
                      class="input-control"
                      placeholder="9000"
                    />
                  </div>
                </div>
                <div
                  style="
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
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
                      v-model="itemModal.itemData.auto_route"
                      type="checkbox"
                    />
                    <span>自动路由 (auto_route)</span>
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
                      v-model="itemModal.itemData.strict_route"
                      type="checkbox"
                    />
                    <span>严格路由 (strict_route)</span>
                  </label>
                  <label
                    :style="{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      cursor: isLinux ? 'pointer' : 'not-allowed',
                      opacity: isLinux ? 1 : 0.6,
                    }"
                    :title="
                      isLinux
                        ? '仅支持 Linux 系统'
                        : '当前系统非 Linux，自动重定向不可用'
                    "
                  >
                    <input
                      v-model="itemModal.itemData.auto_redirect"
                      type="checkbox"
                      :disabled="!isLinux"
                    />
                    <span>自动重定向 (auto_redirect)</span>
                    <span
                      style="
                        font-size: 0.8rem;
                        color: var(--text-muted);
                        margin-left: 0.2rem;
                      "
                      >(仅限 Linux)</span
                    >
                  </label>
                </div>
              </div>
            </div>

            <!-- 4. Route Rule fields -->
            <div v-if="itemModal.itemType === 'route_rule'">
              <div class="grid-2" style="margin-bottom: 1rem">
                <div class="input-group">
                  <label>规则匹配逻辑</label>
                  <select
                    v-model="itemModal.routeRuleLogic"
                    class="input-control"
                  >
                    <option value="standard">
                      默认 AND 逻辑 (需同时满足下方所有非空条件)
                    </option>
                    <option value="or">
                      逻辑或 OR (满足下方任意非空条件即可)
                    </option>
                    <option value="and">逻辑与 AND (仅用于特殊嵌套逻辑)</option>
                  </select>
                </div>
              </div>
              <div class="grid-2">
                <div class="input-group">
                  <label>动作 (Action)</label>
                  <select
                    v-model="itemModal.itemData.action"
                    class="input-control"
                    @change="emit('route-rule-action-change')"
                  >
                    <option value="route">route (路由选择)</option>
                    <option value="reject">reject (拦截阻断)</option>
                    <option value="hijack-dns">hijack-dns (劫持 DNS)</option>
                    <option value="sniff">sniff (流量嗅探)</option>
                  </select>
                </div>
                <div
                  v-if="
                    itemModal.itemData.action === 'route' ||
                    !itemModal.itemData.action
                  "
                  class="input-group"
                >
                  <label>目标出站 Tag (outbound)</label>
                  <select
                    v-model="itemModal.itemData.outbound"
                    class="input-control"
                    required
                  >
                    <option
                      v-if="
                        itemModal.itemData.outbound &&
                        !allOutboundTags.includes(itemModal.itemData.outbound)
                      "
                      :value="itemModal.itemData.outbound"
                    >
                      {{ itemModal.itemData.outbound }} (当前值)
                    </option>
                    <option
                      v-for="tag in allOutboundTags"
                      :key="tag"
                      :value="tag"
                    >
                      {{ tag }}
                    </option>
                  </select>
                </div>
              </div>
              <div
                style="
                  display: grid;
                  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
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
                    v-model="itemModal.itemData.ip_is_private"
                    type="checkbox"
                  />
                  <span>私有 IP 匹配 (ip_is_private)</span>
                </label>
                <label
                  style="
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    cursor: pointer;
                  "
                >
                  <input v-model="itemModal.itemData.invert" type="checkbox" />
                  <span>反转匹配条件 (invert)</span>
                </label>
              </div>
              <div class="input-group" style="margin-top: 1rem">
                <div
                  style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 0.35rem;
                    flex-wrap: wrap;
                    gap: 0.5rem;
                  "
                >
                  <label style="margin-bottom: 0"
                    >进程名称 (process_name, 每行一例)</label
                  >
                  <div
                    class="preset-badges"
                    style="
                      display: flex;
                      gap: 0.35rem;
                      flex-wrap: wrap;
                      align-items: center;
                    "
                  >
                    <span style="font-size: 0.75rem; color: var(--text-muted)"
                      >快捷点选:</span
                    >
                    <button
                      v-for="b in browserPresets"
                      :key="b.label"
                      type="button"
                      class="btn btn-xs btn-secondary"
                      style="padding: 0.15rem 0.4rem; font-size: 0.75rem"
                      :title="b.title"
                      @click="emit('append-preset-process', b.name)"
                    >
                      {{ b.label }}
                    </button>
                  </div>
                </div>
                <textarea
                  v-model="itemModal.tempFields.process_name"
                  class="input-control"
                  style="height: 80px"
                  :placeholder="processNamePlaceholder"
                ></textarea>
                <div
                  style="
                    font-size: 0.75rem;
                    color: var(--text-muted);
                    margin-top: 0.25rem;
                  "
                >
                  {{
                    isApplePlatform
                      ? "提示：填入 macOS 进程名称（例如 Google Chrome、Microsoft Edge、firefox、Safari 等，Chromium 系建议同时包含 Helper），支持多个程序按行分隔。"
                      : isWindowsPlatform
                        ? "提示：填入 Windows 进程可执行文件名（例如 chrome.exe、firefox.exe、msedge.exe 等），支持多个程序按行分隔。"
                        : "提示：填入 Linux 进程可执行文件名（例如 chrome、firefox、msedge 等），支持多个程序按行分隔。"
                  }}
                </div>
              </div>
              <div class="input-group" style="margin-top: 1rem">
                <label>规则集列表 (rule_set, 每行一例)</label>
                <textarea
                  v-model="itemModal.tempFields.rule_set"
                  class="input-control"
                  style="height: 80px"
                  placeholder="geoip-cn&#10;geosite-cn"
                ></textarea>
              </div>
              <div class="input-group" style="margin-top: 1rem">
                <label>域名后缀 (domain_suffix, 每行一例)</label>
                <textarea
                  v-model="itemModal.tempFields.domain_suffix"
                  class="input-control"
                  style="height: 80px"
                  placeholder="google.com&#10;github.com"
                ></textarea>
              </div>
              <div class="input-group" style="margin-top: 1rem">
                <label>Geosite (geosite, 每行一例)</label>
                <textarea
                  v-model="itemModal.tempFields.geosite"
                  class="input-control"
                  style="height: 80px"
                  placeholder="cn&#10;apple"
                ></textarea>
              </div>
              <div class="input-group" style="margin-top: 1rem">
                <label>GeoIP (geoip, 每行一例)</label>
                <textarea
                  v-model="itemModal.tempFields.geoip"
                  class="input-control"
                  style="height: 80px"
                  placeholder="cn&#10;private"
                ></textarea>
              </div>
              <div class="input-group" style="margin-top: 1rem">
                <label>IP CIDR 网段 (ip_cidr, 每行一例)</label>
                <textarea
                  v-model="itemModal.tempFields.ip_cidr"
                  class="input-control"
                  style="height: 80px"
                  placeholder="192.168.1.0/24"
                ></textarea>
              </div>
              <div class="grid-2" style="margin-top: 1rem">
                <div class="input-group">
                  <label>应用层协议 (protocol)</label>
                  <input
                    v-model="itemModal.tempFields.protocol"
                    type="text"
                    class="input-control"
                    placeholder="http, tls, dns"
                  />
                </div>
                <div class="input-group">
                  <label>端口列表 (port)</label>
                  <input
                    v-model="itemModal.tempFields.port"
                    type="text"
                    class="input-control"
                    placeholder="80, 443, 8080"
                  />
                </div>
              </div>
              <div style="margin-top: 1.5rem; text-align: center">
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  style="padding: 0.25rem 0.5rem; font-size: 0.78rem"
                  @click="emit('toggle-advanced-route')"
                >
                  {{
                    showAdvancedRouteFields
                      ? "收起高级匹配条件 ▴"
                      : "展开高级匹配条件 ▾"
                  }}
                </button>
              </div>
              <Transition name="collapse">
                <div
                  v-show="showAdvancedRouteFields"
                  style="
                    margin-top: 1rem;
                    border-top: 1px dashed var(--border-color);
                    padding-top: 1rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                  "
                >
                  <div class="input-group">
                    <label>精确域名 (domain, 每行一例)</label>
                    <textarea
                      v-model="itemModal.tempFields.domain"
                      class="input-control"
                      style="height: 80px"
                      placeholder="www.google.com"
                    ></textarea>
                  </div>
                  <div class="input-group">
                    <label>域名关键字 (domain_keyword)</label>
                    <textarea
                      v-model="itemModal.tempFields.domain_keyword"
                      class="input-control"
                      style="height: 80px"
                      placeholder="google"
                    ></textarea>
                  </div>
                  <div class="input-group">
                    <label>域名正则表达式 (domain_regex)</label>
                    <textarea
                      v-model="itemModal.tempFields.domain_regex"
                      class="input-control"
                      style="height: 80px"
                      placeholder="^google\..*$"
                    ></textarea>
                  </div>
                  <div class="input-group">
                    <label>进程绝对路径 (process_path, 每行一例)</label>
                    <textarea
                      v-model="itemModal.tempFields.process_path"
                      class="input-control"
                      style="height: 80px"
                      :placeholder="processPathPlaceholder"
                    ></textarea>
                  </div>
                  <div class="input-group">
                    <label
                      >进程路径正则表达式 (process_path_regex, 每行一例)</label
                    >
                    <textarea
                      v-model="itemModal.tempFields.process_path_regex"
                      class="input-control"
                      style="height: 80px"
                      placeholder=".*chrome.*&#10;.*firefox.*"
                    ></textarea>
                  </div>
                  <div class="grid-2">
                    <div class="input-group">
                      <label>应用包名 (package_name, Android 专有)</label>
                      <textarea
                        v-model="itemModal.tempFields.package_name"
                        class="input-control"
                        style="height: 60px"
                        placeholder="com.microsoft.emmx"
                      ></textarea>
                    </div>
                    <div class="input-group">
                      <label>运行用户 (user)</label>
                      <textarea
                        v-model="itemModal.tempFields.user"
                        class="input-control"
                        style="height: 60px"
                        placeholder="root&#10;1000"
                      ></textarea>
                    </div>
                  </div>
                  <div class="input-group">
                    <label>来源入站连接 Tag (inbound)</label>
                    <textarea
                      v-model="itemModal.tempFields.inbound"
                      class="input-control"
                      style="height: 80px"
                      placeholder="mixed-in"
                    ></textarea>
                  </div>
                </div>
              </Transition>
            </div>

            <!-- 5. Route RuleSet fields -->
            <div v-if="itemModal.itemType === 'route_ruleset'">
              <div class="grid-2">
                <div class="input-group">
                  <label>Tag 标签名称</label>
                  <input
                    v-model="itemModal.itemData.tag"
                    type="text"
                    class="input-control"
                    placeholder="geosite-cn"
                    required
                  />
                </div>
                <div class="input-group">
                  <label>类型 (Type)</label>
                  <select
                    v-model="itemModal.itemData.type"
                    class="input-control"
                    required
                    @change="emit('ruleset-type-change', itemModal.itemData)"
                  >
                    <option value="remote">remote (远程下载)</option>
                    <option value="local">local (本地文件)</option>
                  </select>
                </div>
              </div>
              <div class="grid-2" style="margin-top: 1rem">
                <div class="input-group">
                  <label>数据格式 (Format)</label>
                  <select
                    v-model="itemModal.itemData.format"
                    class="input-control"
                    required
                  >
                    <option value="binary">binary (.srs)</option>
                    <option value="source">source (.json)</option>
                  </select>
                </div>
                <div
                  v-if="itemModal.itemData.type === 'remote'"
                  class="input-group"
                >
                  <label>下载连接 (URL)</label>
                  <input
                    v-model="itemModal.itemData.url"
                    type="text"
                    class="input-control"
                    placeholder="http://..."
                    required
                  />
                </div>
                <div
                  v-if="itemModal.itemData.type === 'local'"
                  class="input-group"
                >
                  <label>本地路径 (Path)</label>
                  <input
                    v-model="itemModal.itemData.path"
                    type="text"
                    class="input-control"
                    placeholder="rules/file.srs"
                    required
                  />
                </div>
              </div>
              <div
                v-if="itemModal.itemData.type === 'remote'"
                class="grid-2"
                style="margin-top: 1rem"
              >
                <div class="input-group">
                  <label>下载出站代理 Tag (download_detour)</label>
                  <select
                    v-model="itemModal.itemData.download_detour"
                    class="input-control"
                  >
                    <option
                      v-if="
                        itemModal.itemData.download_detour &&
                        !allOutboundTags.includes(
                          itemModal.itemData.download_detour,
                        )
                      "
                      :value="itemModal.itemData.download_detour"
                    >
                      {{ itemModal.itemData.download_detour }} (当前值)
                    </option>
                    <option
                      v-for="tag in allOutboundTags"
                      :key="tag"
                      :value="tag"
                    >
                      {{ tag }}
                    </option>
                  </select>
                </div>
                <div class="input-group">
                  <label>更新时间间隔 (update_interval)</label>
                  <input
                    v-model="itemModal.itemData.update_interval"
                    type="text"
                    class="input-control"
                    placeholder="1d"
                  />
                </div>
              </div>
            </div>

            <!-- 6. Outbound fields -->
            <div v-if="itemModal.itemType === 'outbound'">
              <div class="grid-2">
                <div class="input-group">
                  <label>出站 Tag 标签名称</label>
                  <input
                    v-model="itemModal.itemData.tag"
                    type="text"
                    class="input-control"
                    required
                  />
                </div>
                <div class="input-group">
                  <label>出站类型 (Type)</label>
                  <select
                    v-model="itemModal.itemData.type"
                    class="input-control"
                    required
                  >
                    <option value="direct">direct</option>
                    <option value="block">block</option>
                    <option value="dns">dns</option>
                    <option value="selector">selector</option>
                    <option value="urltest">urltest</option>
                    <option value="trojan">trojan</option>
                    <option value="vless">vless</option>
                    <option value="vmess">vmess</option>
                    <option value="shadowsocks">shadowsocks</option>
                    <option value="wireguard">wireguard</option>
                    <option value="hysteria2">hysteria2</option>
                    <option value="tuic">tuic</option>
                  </select>
                </div>
              </div>

              <!-- Selector / URLTest fields -->
              <div
                v-if="['selector', 'urltest'].includes(itemModal.itemData.type)"
                class="input-group"
                style="margin-top: 1rem"
              >
                <label>子出站 Tags 列表 (用换行或逗号分隔)</label>
                <textarea
                  v-model="itemModal.tempFields.outbounds"
                  class="input-control"
                  style="height: 100px"
                  placeholder="proxy&#10;direct&#10;block"
                ></textarea>
              </div>
              <div
                v-if="itemModal.itemData.type === 'urltest'"
                class="grid-2"
                style="margin-top: 1rem"
              >
                <div class="input-group">
                  <label>选择预设测速点</label>
                  <select
                    :value="presetUrlSelectConfig"
                    class="input-control"
                    @change="emit('preset-url-change', $event)"
                  >
                    <option value="http://cp.cloudflare.com/generate_204">
                      Cloudflare (http://cp.cloudflare.com/generate_204)
                    </option>
                    <option value="http://www.gstatic.com/generate_204">
                      Google Gstatic (http://www.gstatic.com/generate_204)
                    </option>
                    <option
                      value="http://connectivitycheck.gstatic.com/generate_204"
                    >
                      Google Connectivity
                      (http://connectivitycheck.gstatic.com/generate_204)
                    </option>
                    <option
                      value="http://captive.apple.com/hotspot-detect.html"
                    >
                      Captive Apple
                      (http://captive.apple.com/hotspot-detect.html)
                    </option>
                    <option
                      value="http://www.msftconnecttest.com/connecttest.txt"
                    >
                      Microsoft Connect
                      (http://www.msftconnecttest.com/connecttest.txt)
                    </option>
                    <option value="custom">✍️ 自定义手动输入...</option>
                  </select>
                </div>
                <div class="input-group">
                  <label>测速间隔 (interval)</label>
                  <input
                    v-model="itemModal.itemData.interval"
                    type="text"
                    class="input-control"
                    placeholder="3m"
                  />
                </div>
              </div>
              <div
                v-if="
                  itemModal.itemData.type === 'urltest' &&
                  presetUrlSelectConfig === 'custom'
                "
                class="input-group"
                style="margin-top: 1rem"
              >
                <label>自定义测速 URL (url)</label>
                <input
                  v-model="itemModal.itemData.url"
                  type="text"
                  class="input-control"
                  placeholder="输入自定义 HTTP 测速 URL"
                />
              </div>

              <!-- Proxy common fields -->
              <div
                v-if="
                  !['direct', 'block', 'dns', 'selector', 'urltest'].includes(
                    itemModal.itemData.type,
                  )
                "
                class="grid-2"
                style="margin-top: 1rem"
              >
                <div class="input-group">
                  <label>服务器地址</label>
                  <input
                    v-model="itemModal.itemData.server"
                    type="text"
                    class="input-control"
                    placeholder="example.com"
                  />
                </div>
                <div class="input-group">
                  <label>服务端口</label>
                  <input
                    v-model.number="itemModal.itemData.port"
                    type="number"
                    class="input-control"
                    placeholder="443"
                  />
                </div>
              </div>

              <!-- Credentials block -->
              <div
                v-if="
                  [
                    'vmess',
                    'vless',
                    'trojan',
                    'shadowsocks',
                    'hysteria2',
                    'tuic',
                  ].includes(itemModal.itemData.type)
                "
                class="grid-2"
                style="margin-top: 1rem"
              >
                <div
                  v-if="
                    ['vless', 'vmess', 'tuic'].includes(itemModal.itemData.type)
                  "
                  class="input-group"
                >
                  <label>UUID / 用户 ID</label>
                  <input
                    v-model="itemModal.itemData.uuid"
                    type="text"
                    class="input-control"
                  />
                </div>
                <div
                  v-if="
                    ['shadowsocks', 'trojan', 'hysteria2', 'tuic'].includes(
                      itemModal.itemData.type,
                    )
                  "
                  class="input-group"
                >
                  <label>密码</label>
                  <input
                    v-model="itemModal.itemData.password"
                    type="text"
                    class="input-control"
                  />
                </div>
                <div
                  v-if="itemModal.itemData.type === 'shadowsocks'"
                  class="input-group"
                >
                  <label>加密方法 (method)</label>
                  <input
                    v-model="itemModal.itemData.method"
                    type="text"
                    class="input-control"
                    placeholder="aes-128-gcm"
                  />
                </div>
              </div>

              <!-- Hysteria2 Speed limits -->
              <div
                v-if="itemModal.itemData.type === 'hysteria2'"
                class="grid-2"
                style="margin-top: 1rem"
              >
                <div class="input-group">
                  <label>上行带宽 Mbps</label>
                  <input
                    v-model.number="itemModal.itemData.up_mbps"
                    type="number"
                    class="input-control"
                    placeholder="100"
                  />
                </div>
                <div class="input-group">
                  <label>下行带宽 Mbps</label>
                  <input
                    v-model.number="itemModal.itemData.down_mbps"
                    type="number"
                    class="input-control"
                    placeholder="100"
                  />
                </div>
              </div>

              <!-- TLS Config Block -->
              <div
                v-if="
                  [
                    'vmess',
                    'vless',
                    'trojan',
                    'hysteria2',
                    'tuic',
                    'socks',
                    'http',
                  ].includes(itemModal.itemData.type)
                "
                style="
                  margin-top: 1rem;
                  border: 1px solid var(--border-color);
                  padding: 1rem;
                  border-radius: 8px;
                  background: rgba(255, 255, 255, 0.01);
                "
              >
                <div
                  style="
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    margin-bottom: 0.75rem;
                  "
                >
                  <input
                    id="outbound-tls-enabled"
                    v-model="itemModal.itemData.tls.enabled"
                    type="checkbox"
                    style="width: 1.1rem; height: 1.1rem"
                  />
                  <label
                    for="outbound-tls-enabled"
                    style="
                      font-weight: 600;
                      cursor: pointer;
                      color: var(--secondary);
                    "
                    >开启 TLS 传输加密</label
                  >
                </div>
                <div
                  v-if="itemModal.itemData.tls.enabled"
                  class="flex flex-col gap-3"
                >
                  <div class="grid-2">
                    <div class="input-group">
                      <label>服务器域名 (server_name / SNI)</label>
                      <input
                        v-model="itemModal.itemData.tls.server_name"
                        type="text"
                        class="input-control"
                        placeholder="留空默认使用服务器地址"
                      />
                    </div>
                    <div
                      class="input-group"
                      style="
                        display: flex;
                        align-items: center;
                        margin-top: 1.5rem;
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
                          v-model="itemModal.itemData.tls.insecure"
                          type="checkbox"
                        />
                        <span>允许不安全证书 (insecure / 跳过验证)</span>
                      </label>
                    </div>
                  </div>
                  <!-- Reality support -->
                  <div
                    v-if="['vless', 'vmess'].includes(itemModal.itemData.type)"
                    style="
                      border-top: 1px dashed var(--border-color);
                      padding-top: 0.75rem;
                      margin-top: 0.25rem;
                    "
                  >
                    <div
                      style="
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                        margin-bottom: 0.75rem;
                      "
                    >
                      <input
                        id="outbound-reality-enabled"
                        v-model="itemModal.itemData.tls.reality.enabled"
                        type="checkbox"
                        style="width: 1rem; height: 1rem"
                      />
                      <label
                        for="outbound-reality-enabled"
                        style="
                          font-weight: 600;
                          cursor: pointer;
                          font-size: 0.9rem;
                        "
                        >启用 REALITY 伪装</label
                      >
                    </div>
                    <div
                      v-if="itemModal.itemData.tls.reality.enabled"
                      class="grid-2"
                    >
                      <div class="input-group">
                        <label>REALITY 公钥</label>
                        <input
                          v-model="itemModal.itemData.tls.reality.public_key"
                          type="text"
                          class="input-control"
                        />
                      </div>
                      <div class="input-group">
                        <label>REALITY 临时ID</label>
                        <input
                          v-model="itemModal.itemData.tls.reality.short_id"
                          type="text"
                          class="input-control"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Transport Config Block -->
              <div
                v-if="
                  ['vmess', 'vless', 'trojan', 'shadowsocks'].includes(
                    itemModal.itemData.type,
                  )
                "
                style="
                  margin-top: 1rem;
                  border: 1px solid var(--border-color);
                  padding: 1rem;
                  border-radius: 8px;
                  background: rgba(255, 255, 255, 0.01);
                "
              >
                <div class="grid-2">
                  <div class="input-group">
                    <label>传输层协议类型</label>
                    <select
                      v-model="itemModal.itemData.transport.type"
                      class="input-control"
                    >
                      <option value="">-- 默认 (TCP / 无额外传输) --</option>
                      <option value="ws">ws (WebSocket)</option>
                      <option value="grpc">grpc</option>
                      <option value="http">http</option>
                    </select>
                  </div>
                  <div
                    v-if="
                      ['ws', 'http'].includes(itemModal.itemData.transport.type)
                    "
                    class="input-group"
                  >
                    <label>Websocket/HTTP 路径</label>
                    <input
                      v-model="itemModal.itemData.transport.path"
                      type="text"
                      class="input-control"
                      placeholder="例如: /websocket"
                    />
                  </div>
                  <div
                    v-if="itemModal.itemData.transport.type === 'grpc'"
                    class="input-group"
                  >
                    <label>gRPC 服务名称</label>
                    <input
                      v-model="itemModal.itemData.transport.service_name"
                      type="text"
                      class="input-control"
                      placeholder="例如: grpc-service"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- B. JSON Code Mode -->
          <div v-if="itemModal.mode === 'json'">
            <div
              class="input-group"
              style="margin-top: 0.5rem; margin-bottom: 0.5rem"
            >
              <label>完整项目的 JSON 结构 (可添加任意非标准属性)</label>
              <textarea
                v-model="itemModal.jsonText"
                class="input-control"
                style="
                  font-family: var(--font-mono);
                  height: 280px;
                  font-size: 0.85rem;
                  background: rgba(0, 0, 0, 0.1);
                "
              ></textarea>
            </div>
          </div>

          <div
            v-if="itemModal.error"
            class="text-danger"
            style="
              margin-top: 0.5rem;
              font-size: 0.85rem;
              color: #f87171;
              background: rgba(248, 113, 113, 0.05);
              padding: 0.5rem;
              border-radius: 4px;
              border-left: 3px solid #f87171;
            "
          >
            <strong>校验错误: </strong>{{ itemModal.error }}
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
          <button
            type="button"
            class="btn"
            :disabled="!!itemModal.error || itemModal.validating"
            @click="emit('save')"
          >
            <span v-if="itemModal.validating">校验中...</span>
            <span v-else>确认保存</span>
          </button>
        </div>
      </div>
    </div>

</template>

<script setup>
defineProps({
  itemModal: { type: Object, required: true },
  configData: { type: Object, required: true },
  allOutboundTags: { type: Array, default: () => [] },
  browserPresets: { type: Array, default: () => [] },
  isLinux: { type: Boolean, default: true },
  isApplePlatform: { type: Boolean, default: false },
  isWindowsPlatform: { type: Boolean, default: false },
  showAdvancedDnsFields: { type: Boolean, default: false },
  showAdvancedRouteFields: { type: Boolean, default: false },
  presetUrlSelectConfig: { type: String, default: "" },
  processNamePlaceholder: { type: String, default: "" },
  processPathPlaceholder: { type: String, default: "" },
  getAddressPlaceholder: { type: Function, required: true },
});

const emit = defineEmits([
  "close",
  "set-mode",
  "save",
  "dns-server-type-change",
  "inbound-type-change",
  "ruleset-type-change",
  "route-rule-action-change",
  "toggle-advanced-dns",
  "toggle-advanced-route",
  "append-preset-process",
  "preset-url-change",
  "update:preset-url-select-config",
]);
</script>
