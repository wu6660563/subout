<template>
  <section class="help-view">
    <header class="help-hero">
      <div>
        <p class="eyebrow">SUBOUT DOCUMENTATION</p>
        <h1>使用说明</h1>
        <p class="hero-copy">
          从订阅导入到 sing-box 服务应用的一站式操作指南。本文只说明当前 Subout
          界面会管理的配置，并以 sing-box 1.13.19 为准。
        </p>
      </div>
      <div class="version-card" aria-label="适用版本">
        <span>适用版本</span>
        <strong>sing-box 1.13.19</strong>
        <small>字段随内核升级时，请以对应版本官方文档为准。</small>
      </div>
    </header>

    <div class="help-toolbar">
      <label class="search-box">
        <span aria-hidden="true">⌕</span>
        <input
          v-model.trim="query"
          type="search"
          placeholder="搜索说明、字段或配置示例"
          aria-label="搜索使用说明"
        />
        <kbd v-if="query">{{ filteredSections.length }}</kbd>
      </label>
      <a
        class="official-link"
        href="https://sing-box.sagernet.org/zh/configuration/certificate/"
        target="_blank"
        rel="noreferrer"
      >
        官方证书文档 ↗
      </a>
    </div>

    <div class="help-layout">
      <nav class="help-toc" aria-label="说明目录">
        <p>本页目录</p>
        <a
          v-for="section in filteredSections"
          :key="section.id"
          :href="`#help/${section.id}`"
          @click.prevent="scrollToSection(section.id)"
        >
          {{ section.nav }}
        </a>
      </nav>

      <div class="help-content">
        <article
          v-for="section in filteredSections"
          :id="section.id"
          :key="section.id"
          class="doc-section"
        >
          <div class="section-heading">
            <span>{{ section.index }}</span>
            <div>
              <p>{{ section.kicker }}</p>
              <h2>{{ section.title }}</h2>
            </div>
          </div>

          <template v-if="section.id === 'quick-start'">
            <p>
              建议按下面顺序完成首次使用。每一步都可回到对应页面调整，不需要手动修改
              运行中的 sing-box 文件。
            </p>
            <ol class="steps-grid">
              <li v-for="step in quickStartSteps" :key="step.title">
                <span>{{ step.number }}</span>
                <strong>{{ step.title }}</strong>
                <p>{{ step.body }}</p>
                <button class="text-link" type="button" @click="go(step.view)">
                  前往{{ step.destination }} →
                </button>
              </li>
            </ol>
          </template>

          <template v-else-if="section.id === 'modes'">
            <div class="mode-grid">
              <div class="mode-card">
                <span class="mode-badge">简单模式</span>
                <h3>常用代理场景的预设</h3>
                <p>
                  用少量开关生成完整配置，适合首次部署和不需要手写规则的场景。
                </p>
                <ul>
                  <li>
                    选择 TUN 或混合入站、DNS 预设、默认出站与常用拦截规则。
                  </li>
                  <li>先用“预览完全配置”确认结果，再保存并应用服务。</li>
                </ul>
                <button
                  class="text-link"
                  type="button"
                  @click="go('simpleConfig')"
                >
                  打开极简配置 →
                </button>
              </div>
              <div class="mode-card expert">
                <span class="mode-badge">专业模式</span>
                <h3>完整掌控六大配置区</h3>
                <p>
                  适合需要分流、多个 DNS、复杂出站组或导入现有 sing-box JSON
                  的场景。
                </p>
                <ul>
                  <li>
                    在可视化表单和原始 JSON 之间切换；保存后会同步到同一份配置。
                  </li>
                  <li>导入/编辑后先执行 sing-box 校验，再应用到服务。</li>
                </ul>
                <button class="text-link" type="button" @click="go('configs')">
                  打开配置管理 →
                </button>
              </div>
            </div>
          </template>

          <template v-else-if="section.id === 'subscriptions'">
            <div class="callout info">
              <strong>更新的范围：</strong
              >订阅更新会重新解析并同步订阅来源的节点；远程基础配置更新会更新基础模板。
              本地配置的分组出站组按其保存的筛选/节点规则重新收集可用节点，不会被订阅文本直接替换为同名分组。
            </div>
            <div class="two-column">
              <div>
                <h3>订阅与节点</h3>
                <ul>
                  <li>在“订阅管理”添加 URL，选择启用状态后拉取更新。</li>
                  <li>
                    解析出的节点进入节点池；可按名称、协议、地区或启用状态筛选。
                  </li>
                  <li>
                    测速先测试 TCP 连通和延迟；网页测速需要已安装可运行的
                    sing-box 内核。
                  </li>
                </ul>
              </div>
              <div>
                <h3>分组出站组</h3>
                <ul>
                  <li>
                    <code>selector</code> 用于人工选择成员节点或其他出站。
                  </li>
                  <li>
                    <code>urltest</code> 按 URL、间隔与容差自动挑选低延迟节点。
                  </li>
                  <li>
                    订阅更新后，满足组筛选条件的新节点会进入组；已消失节点会自然不再参与生成。
                  </li>
                </ul>
                <button class="text-link" type="button" @click="go('groups')">
                  管理分流出站组 →
                </button>
              </div>
            </div>
          </template>

          <template v-else-if="section.id === 'network-basics'">
            <div class="two-column">
              <div>
                <h3>TUN 入站与 IPv6</h3>
                <p>
                  TUN 会创建虚拟网卡并接管匹配流量，通常需要管理员权限。<code
                    >address</code
                  >
                  只保留你在编辑器中明确配置的地址；未填写 IPv6
                  时，预览和应用不会自动补入
                  <code>fd00::1/126</code>。
                </p>
              </div>
              <div>
                <h3>FakeIP 与 DNS</h3>
                <p>
                  FakeIP 使用虚拟地址映射域名。仅配置 IPv4 范围时，输出只包含
                  <code>inet4_range</code>；只有显式填写 IPv6 范围时，才会保留
                  <code>inet6_range</code>。
                </p>
              </div>
            </div>
            <div class="code-panel">
              <div>
                <span>仅 IPv4 的 FakeIP 示例</span
                ><button
                  data-copy="fakeip-example"
                  type="button"
                  @click="copy(fakeIpExample, 'fakeip-example')"
                >
                  {{ copied === "fakeip-example" ? "已复制" : "复制" }}
                </button>
              </div>
              <pre><code>{{ fakeIpExample }}</code></pre>
            </div>
          </template>

          <template v-else-if="section.id === 'editor-fields'">
            <p>
              专业模式的配置管理将完整配置拆为六个区域。下列说明针对当前可视化编辑器；通过原始
              JSON 导入的其他 sing-box 字段可保留，但不保证每项都有表单控件。
            </p>
            <div class="field-grid">
              <section
                v-for="field in editorFields"
                :key="field.name"
                class="field-card"
              >
                <div class="field-card-title">
                  <code>{{ field.name }}</code
                  ><span>{{ field.label }}</span>
                </div>
                <p>{{ field.description }}</p>
                <dl>
                  <template v-for="item in field.items" :key="item.name">
                    <dt>
                      <code>{{ item.name }}</code>
                    </dt>
                    <dd>{{ item.description }}</dd>
                  </template>
                </dl>
              </section>
            </div>
          </template>

          <template v-else-if="section.id === 'outbound-examples'">
            <p>
              节点来源通常由订阅解析生成；手动新增节点时，请确保协议参数与服务端一致。出站组的成员
              Tag 必须存在。
            </p>
            <div class="example-grid">
              <div
                v-for="example in outboundExamples"
                :key="example.id"
                class="code-panel compact"
              >
                <div>
                  <span>{{ example.title }}</span
                  ><button
                    :data-copy="example.id"
                    type="button"
                    @click="copy(example.code, example.id)"
                  >
                    {{ copied === example.id ? "已复制" : "复制" }}
                  </button>
                </div>
                <p>{{ example.description }}</p>
                <pre><code>{{ example.code }}</code></pre>
              </div>
            </div>
          </template>

          <template v-else-if="section.id === 'certificate'">
            <div class="callout warning">
              <strong>字段边界：</strong
              >这里的 <code>certificate</code> 是 sing-box 1.13.19 的顶层“受信任
              CA 证书库”配置，用于校验对端证书；它不等同于服务端入站使用的私钥、
              <code>key_path</code> 或 <code>acme</code>。后者属于具体协议的 TLS
              字段，应在对应协议文档中配置。
            </div>
            <div class="two-column">
              <div>
                <h3>受信任根证书库 <code>certificate</code></h3>
                <dl class="inline-fields">
                  <dt><code>store</code></dt>
                  <dd>
                    选择默认受信任 CA：<code>system</code>（默认、操作系统证书库）、
                    <code>mozilla</code>、<code>chrome</code> 或 <code>none</code>
                    （不预置信任根）。选择 <code>none</code> 后必须自行提供所需 CA。
                  </dd>
                  <dt><code>certificate</code></dt>
                  <dd>
                    直接写入 PEM 格式证书内容；可为一个字符串或数组。适合少量固定的私有
                    CA，但把大段 PEM 放入 JSON 会降低可维护性。
                  </dd>
                </dl>
              </div>
              <div>
                <h3>从文件加载的自定义 CA</h3>
                <dl class="inline-fields">
                  <dt><code>certificate_path</code></dt>
                  <dd>
                    一个或多个 PEM 证书文件路径；文件变动会自动重新加载。建议使用绝对路径，
                    并确保运行 Subout 的账户有读取权限。
                  </dd>
                  <dt><code>certificate_directory_path</code></dt>
                  <dd>
                    扫描目录内的 PEM 证书，同样会在文件变更时重新加载。适合由企业 CA
                    或部署工具维护的一组证书；目录中放入无关/失效证书会扩大信任范围。
                  </dd>
                </dl>
              </div>
            </div>
            <div class="callout info">
              <strong>本系统如何处理：</strong>专业模式没有独立的证书表单；请在原始 JSON
              顶层新增 <code>certificate</code> 对象，保存后用“预览完全配置”和
              <code>sing-box check</code> 验证。协议节点中常见的
              <code>tls.server_name</code> 是对端 SNI/名称校验设置，和本节 CA 库配合
              使用；请勿以 <code>insecure: true</code> 代替正确的 CA 配置。
            </div>
            <p class="reference">
              字段权威说明：<a
                href="https://sing-box.sagernet.org/zh/configuration/certificate/"
                target="_blank"
                rel="noreferrer"
                >sing-box Certificate 配置文档 ↗</a
              >
            </p>
          </template>

          <template v-else-if="section.id === 'apply'">
            <ol class="apply-list">
              <li>
                <strong>预览：</strong>先检查合并后的完整 JSON、出站 Tag
                和路由目标是否正确。
              </li>
              <li>
                <strong>校验：</strong>使用内置 sing-box
                校验；报错时根据定位回到对应配置区修正。
              </li>
              <li>
                <strong>应用：</strong>保存并应用后，Subout
                写入生成配置并启动或重启受管服务。
              </li>
              <li>
                <strong>观察：</strong
                >在核心日志中确认启动完成；网站测试用于确认实际分流结果。
              </li>
            </ol>
            <div class="callout danger">
              <strong>避免冲突：</strong>运行 Subout 前先停止其他独立的 sing-box
              服务，或使用控制中心的一键接管功能。两个核心同时运行可能争夺端口、TUN
              路由或系统代理。
            </div>
          </template>
        </article>

        <div v-if="filteredSections.length === 0" class="empty-state">
          <strong>没有找到“{{ query }}”</strong>
          <p>
            可尝试搜索字段名，例如
            <code>FakeIP</code
            >、<code>urltest</code>、<code>server_name</code>。
          </p>
          <button type="button" class="btn btn-secondary" @click="query = ''">
            清除搜索
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from "vue";

const emit = defineEmits(["navigate"]);
const query = ref("");
const copied = ref("");

const quickStartSteps = [
  {
    number: "01",
    title: "准备内核",
    body: "在控制中心下载或检测 sing-box 1.13.19。",
    view: "dashboard",
    destination: "控制中心",
  },
  {
    number: "02",
    title: "添加订阅",
    body: "保存订阅地址并拉取节点；失败时检查地址和网络。",
    view: "subscriptions",
    destination: "订阅管理",
  },
  {
    number: "03",
    title: "选择节点",
    body: "筛选节点后做延迟或网页测速，保留可用节点。",
    view: "nodes",
    destination: "节点池",
  },
  {
    number: "04",
    title: "配置并应用",
    body: "选择简单或专业模式，预览、校验并应用配置。",
    view: "simpleConfig",
    destination: "配置页面",
  },
];

const editorFields = [
  {
    name: "log",
    label: "日志",
    description: "控制 sing-box 运行日志。排障优先保留 info/warn；只有复现问题时短时开启 debug。",
    items: [
      {
        name: "level",
        description: "级别从详细到简略通常为 trace、debug、info、warn、error、fatal、panic；日常建议 info，debug/trace 会显著增加磁盘与敏感连接信息暴露风险。",
      },
      { name: "timestamp", description: "是否为每行日志添加时间；排查启动顺序、掉线时间时开启。" },
      { name: "output", description: "日志文件路径；留空走标准输出。填写后目录必须存在且服务账户可写；注意日志轮转，避免长期占满磁盘。" },
      {
        name: "disabled",
        description: "true 时关闭核心日志。仅在存储受限、已经有外部观测时考虑；故障排查前应恢复 false。",
      },
    ],
  },
  {
    name: "dns",
    label: "DNS",
    description: "定义解析请求发往哪里、哪个规则命中哪个服务器，以及最终兜底。DNS 标签必须和规则引用一致。",
    items: [
      {
        name: "servers",
        description: "每项包含唯一 tag 和 type/address 等参数；常见 local、udp、tcp、tls、https、quic、fakeip。规则、final 引用的 tag 不存在会导致校验或运行异常。",
      },
      {
        name: "strategy",
        description: "解析地址族策略，例如 prefer_ipv4、prefer_ipv6、ipv4_only、ipv6_only；双栈不稳定时 prefer_ipv4 较常用，强制 only 会使另一地址族站点不可达。",
      },
      { name: "rules / final", description: "rules 按顺序匹配域名、规则集等；final 是未命中时的 DNS 服务器 tag。先放精确/私有域名规则，再放通用规则。" },
      {
        name: "fakeip / inet4_range / inet6_range",
        description:
          "FakeIP 服务使用虚拟网段保留域名映射。只填 inet4_range 时输出仅含 IPv4；只有明确填写 inet6_range 才保留 IPv6，系统不会自动补写。不要与局域网、VPN 或真实路由网段重叠。",
      },
    ],
  },
  {
    name: "inbounds",
    label: "入站",
    description: "定义本机怎样把流量交给 sing-box。每个入站 tag 必须唯一；TUN 会改变系统路由，先从少量规则验证。",
    items: [
      {
        name: "type",
        description: "tun 接管系统流量；mixed 同端口提供 HTTP+SOCKS；http/socks 是单协议本地代理。type 一旦改变，原类型专属字段应同步清理。",
      },
      { name: "tag / listen / listen_port", description: "tag 供 route.rules 的 inbound 引用；listen/listen_port 仅适用于监听型入站。只需本机使用时监听 127.0.0.1，避免暴露代理端口。" },
      {
        name: "address",
        description: "TUN 虚拟网卡 CIDR 地址数组；只输出明确填写的 IPv4/IPv6 项。未填写 IPv6 时不会自动写入 fd00::1/126。",
      },
      {
        name: "auto_route / strict_route / stack",
        description:
          "auto_route 自动添加路由；strict_route 尽量防止流量绕过 TUN；stack 常见 mixed/system/gvisor，兼容性和性能不同。Windows TUN 需要管理员权限，远程桌面/公司 VPN 环境先测试回退方案。",
      },
    ],
  },
  {
    name: "outbounds",
    label: "出站",
    description: "节点协议、内置动作和出站组的集合。路由只认 tag；任何改名都要同步检查 route、DNS detour 与组成员。",
    items: [
      {
        name: "tag",
        description: "唯一出站名称，路由 final 和规则都通过它引用。",
      },
      {
        name: "type",
        description: "订阅节点常见 vless、vmess、trojan、shadowsocks 等；内置 direct 直连、block 拒绝；selector 手选成员，urltest 按测试结果自动选。不要把协议字段套用到 direct/block。",
      },
      {
        name: "server / server_port",
        description: "协议节点的服务端域名/IP 与端口。域名的解析路径受 DNS/route 影响；端口、UUID、密码、TLS/传输参数必须和服务端一致，订阅更新一般负责同步这些字段。",
      },
      {
        name: "detour",
        description: "让当前出站经另一出站建立连接（例如链式代理）；值必须是已有 tag，且不能形成循环。普通订阅节点通常不设置。",
      },
      {
        name: "outbounds / url / interval / tolerance",
        description: "selector/urltest 的 outbounds 是成员 tag 列表；urltest 的 url 为探测地址、interval 为间隔、tolerance 为允许的延迟差。成员为空或测试 URL 不可达时不会得到可用自动选择结果。",
      },
    ],
  },
  {
    name: "route",
    label: "路由",
    description: "按域名、IP、进程、入站或规则集选择出口；规则从上到下优先匹配，输出目标必须是有效出站 tag。",
    items: [
      {
        name: "rules",
        description: "规则对象可按 domain、domain_suffix、ip_cidr、geosite、geoip、inbound、network 等条件匹配，动作常用 outbound。更具体、阻断和 DNS 相关规则应在通配规则之前。",
      },
      { name: "final", description: "没有规则命中时的默认出站 tag。推荐显式设置，避免依赖内核默认行为；修改组 tag 后必须同步修改。" },
      { name: "rule_set", description: "可复用的本地或远程规则集定义。远程规则集需考虑下载失败、更新频率和供应方可信度；规则中引用前要确保 tag 已声明。" },
      {
        name: "auto_detect_interface",
        description: "自动识别默认网络接口，笔记本切换 Wi-Fi/有线时通常有帮助；复杂多网卡、VPN、TUN 环境要结合 detour/route 逐项验证。",
      },
    ],
  },
  {
    name: "experimental",
    label: "实验功能",
    description: "保存运行状态与兼容控制接口。它们会带来本地端口、磁盘状态或兼容层，启用前明确需要什么。",
    items: [
      {
        name: "cache_file",
        description: "持久化 selector 选择、FakeIP 映射等状态；store_fakeip/store_rdrc 等开关决定保存内容。文件路径必须可写，清空缓存会使相关映射和选择恢复初始状态。",
      },
      {
        name: "clash_api",
        description: "兼容 Clash API 的控制接口，常含 external_controller、secret、external_ui 等字段。仅监听 127.0.0.1；若确需远程管理，必须设强 secret 并配置防火墙，切勿裸露到公网。",
      },
    ],
  },
];

const fakeIpExample = `{
  "type": "fakeip",
  "tag": "dns_fakeip",
  "inet4_range": "198.18.0.0/15"
}`;

const outboundExamples = [
  {
    id: "selector-example",
    title: "手动选择组 selector",
    description: "将可选节点或其他出站按 tag 放进列表。",
    code: `{
  "type": "selector",
  "tag": "proxy",
  "outbounds": ["node-a", "node-b", "direct"]
}`,
  },
  {
    id: "urltest-example",
    title: "自动测速组 urltest",
    description: "定期请求测试 URL，并在容差内挑选低延迟节点。",
    code: `{
  "type": "urltest",
  "tag": "auto",
  "outbounds": ["node-a", "node-b"],
  "url": "http://cp.cloudflare.com/generate_204",
  "interval": "3m",
  "tolerance": 50
}`,
  },
  {
    id: "builtin-example",
    title: "内置动作 direct / block",
    description: "direct 直连，block 丢弃匹配流量，二者均可作为路由目标。",
    code: `[
  { "type": "direct", "tag": "direct" },
  { "type": "block", "tag": "block" }
]`,
  },
];

const sections = [
  {
    id: "quick-start",
    nav: "首次使用",
    index: "01",
    kicker: "GET STARTED",
    title: "系统操作流程",
    search: "内核 订阅 节点 测速 预览 校验 应用 服务",
  },
  {
    id: "modes",
    nav: "简单与专业模式",
    index: "02",
    kicker: "CHOOSE A MODE",
    title: "选择合适的配置方式",
    search: "简单模式 专业模式 极简配置 配置管理",
  },
  {
    id: "subscriptions",
    nav: "订阅、测速与出站组",
    index: "03",
    kicker: "SUBSCRIPTIONS",
    title: "订阅更新与分组更新规则",
    search: "订阅 更新 节点 测速 selector urltest 分组出站组 远程基础配置",
  },
  {
    id: "network-basics",
    nav: "TUN、FakeIP 与 IPv6",
    index: "04",
    kicker: "NETWORK BASICS",
    title: "网络配置的关键边界",
    search: "TUN 入站 FakeIP DNS IPv6 inet4_range inet6_range fd00",
  },
  {
    id: "editor-fields",
    nav: "专业模式六大区",
    index: "05",
    kicker: "EXPERT EDITOR",
    title: "专业模式字段说明",
    search:
      "log dns inbounds outbounds route experimental level timestamp output servers strategy final address auto_route strict_route cache_file clash_api",
  },
  {
    id: "outbound-examples",
    nav: "出站配置示例",
    index: "06",
    kicker: "OUTBOUND EXAMPLES",
    title: "节点与出站组示例",
    search: "selector urltest direct block server server_port detour",
  },
  {
    id: "certificate",
    nav: "TLS 与证书",
    index: "07",
    kicker: "TLS / CERTIFICATE",
    title: "TLS 与证书配置",
    search:
      "TLS 证书 certificate certificate_path key_path server_name insecure ACME",
  },
  {
    id: "apply",
    nav: "预览、校验与应用",
    index: "08",
    kicker: "DEPLOY",
    title: "让配置安全生效",
    search: "预览 校验 应用 日志 服务 冲突",
  },
];

const normalizedQuery = computed(() => query.value.toLowerCase());
const filteredSections = computed(() => {
  if (!normalizedQuery.value) return sections;
  return sections.filter((section) =>
    `${section.title} ${section.nav} ${section.search}`
      .toLowerCase()
      .includes(normalizedQuery.value),
  );
});

function go(view) {
  emit("navigate", view);
}

function scrollToSection(id, updateHash = true) {
  if (updateHash) {
    window.history.replaceState(null, "", `#help/${id}`);
  }
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

onMounted(async () => {
  const [view, sectionId] = window.location.hash.substring(1).split("/");
  if (view === "help" && sectionId) {
    await nextTick();
    scrollToSection(sectionId, false);
  }
});

async function copy(value, id) {
  try {
    await navigator.clipboard?.writeText(value);
    copied.value = id;
    window.setTimeout(() => {
      if (copied.value === id) copied.value = "";
    }, 1600);
  } catch {
    copied.value = "";
  }
}
</script>

<style scoped>
.help-view {
  min-width: 0;
  width: 100%;
  height: 100%;
  overflow: auto;
  container-type: inline-size;
  padding-right: 0.35rem;
  color: var(--text-main);
}
.help-hero {
  display: flex;
  justify-content: space-between;
  gap: 2rem;
  padding: 2rem;
  border-radius: 18px;
  color: #f8fbff;
  background:
    radial-gradient(circle at top right, #0aa4bd 0, transparent 34%),
    linear-gradient(122deg, #102a43, #1a4b69);
}
.eyebrow,
.section-heading p {
  margin: 0 0 0.4rem;
  color: #79d9e8;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.12em;
}
.help-hero h1 {
  margin: 0;
  font-size: 2rem;
}
.hero-copy {
  max-width: 700px;
  margin: 0.75rem 0 0;
  color: #d8e8ef;
  line-height: 1.7;
}
.version-card {
  min-width: 200px;
  align-self: center;
  padding: 1rem 1.1rem;
  border: 1px solid #65d0df66;
  border-radius: 12px;
  background: #ffffff12;
}
.version-card span,
.version-card small {
  display: block;
  color: #b6d4dd;
  font-size: 0.78rem;
}
.version-card strong {
  display: block;
  margin: 0.25rem 0;
  font-size: 1.05rem;
}
.help-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin: 1.25rem 0;
}
.search-box {
  display: flex;
  align-items: center;
  flex: 1;
  max-width: 600px;
  padding: 0.65rem 0.85rem;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card);
}
.search-box span {
  color: var(--text-muted);
  font-size: 1.4rem;
}
.search-box input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-main);
  padding-left: 0.6rem;
}
.search-box kbd {
  padding: 0.1rem 0.45rem;
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-muted);
}
.official-link,
.text-link {
  color: var(--primary);
  font-weight: 650;
  text-decoration: none;
}
.text-link {
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  font: inherit;
}
.help-layout {
  display: block;
  width: 100%;
  min-width: 0;
}
.help-toc {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  min-width: 0;
  max-width: 100%;
  margin: 0 0 1rem;
  padding: 0.45rem;
  overflow-x: auto;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card-hover);
  scrollbar-width: thin;
}
.help-toc p {
  flex: 0 0 auto;
  margin: 0 0.3rem 0 0.15rem;
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 700;
}
.help-toc a {
  flex: 0 0 auto;
  padding: 0.42rem 0.65rem;
  color: var(--text-muted);
  text-decoration: none;
  font-size: 0.85rem;
  border: 1px solid transparent;
  border-radius: 7px;
  white-space: nowrap;
}
.help-toc a:hover {
  color: var(--primary);
  border-color: var(--primary);
  background: var(--bg-card-hover);
}
.help-content {
  min-width: 0;
}

/* 内容区始终占满可用宽度，目录不再作为左侧栏参与宽度分配。 */
@container (max-width: 680px) {
  .help-toc {
    align-items: flex-start;
  }
  .help-toc p {
    display: none;
  }
}
.doc-section {
  padding: 1.55rem;
  margin-bottom: 1rem;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--bg-card);
  scroll-margin-top: 1rem;
}
.section-heading {
  display: flex;
  gap: 0.9rem;
  align-items: flex-start;
  margin-bottom: 1.2rem;
}
.section-heading > span {
  display: grid;
  place-items: center;
  width: 2.1rem;
  height: 2.1rem;
  border-radius: 8px;
  color: #077b92;
  background: #0ca3be1a;
  font-size: 0.76rem;
  font-weight: 800;
}
.section-heading h2 {
  margin: 0;
  font-size: 1.25rem;
}
.doc-section > p,
.doc-section li,
.doc-section dd {
  line-height: 1.72;
}
.doc-section code {
  color: #087e94;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 0.9em;
}
.steps-grid,
.mode-grid,
.two-column,
.example-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}
.steps-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  padding: 0;
  list-style: none;
}
.steps-grid li,
.mode-card,
.field-card {
  padding: 1rem;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card-hover);
}
.steps-grid li > span {
  color: var(--primary);
  font-weight: 800;
  font-size: 0.78rem;
}
.steps-grid strong {
  display: block;
  margin: 0.4rem 0;
}
.steps-grid p,
.mode-card p {
  color: var(--text-muted);
  font-size: 0.87rem;
  line-height: 1.55;
}
.mode-card.expert {
  border-color: #0ca3be55;
}
.mode-badge {
  color: #087e94;
  font-size: 0.75rem;
  font-weight: 800;
}
.mode-card h3,
.two-column h3 {
  margin: 0.45rem 0;
  font-size: 1rem;
}
.mode-card ul,
.two-column ul {
  padding-left: 1.1rem;
  font-size: 0.88rem;
}
.two-column {
  margin-top: 0.9rem;
}
.two-column > div {
  padding: 0.9rem 1rem;
  border-radius: 10px;
  background: var(--bg-card-hover);
}
.two-column p {
  margin: 0.4rem 0;
  color: var(--text-muted);
}
.callout {
  padding: 0.85rem 1rem;
  margin-bottom: 1rem;
  border-left: 3px solid;
  border-radius: 8px;
  line-height: 1.65;
  font-size: 0.9rem;
}
.callout.info {
  border-color: #0ca3be;
  background: #0ca3be14;
}
.callout.warning {
  border-color: #d88a00;
  background: #d88a0014;
}
.callout.danger {
  border-color: var(--danger);
  background: #d32f2f12;
  margin-top: 1rem;
}
.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}
.field-card-title {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: center;
}
.field-card-title span {
  color: var(--text-muted);
  font-size: 0.8rem;
}
.field-card p {
  min-height: 3.2em;
  margin: 0.75rem 0;
  color: var(--text-muted);
  font-size: 0.88rem;
}
.field-card dl,
.inline-fields {
  display: grid;
  grid-template-columns: minmax(110px, auto) 1fr;
  gap: 0.45rem 0.75rem;
  margin: 0;
  font-size: 0.84rem;
}
.field-card dt,
.inline-fields dt {
  font-weight: 700;
}
.field-card dd,
.inline-fields dd {
  margin: 0;
  color: var(--text-muted);
}
.code-panel {
  margin-top: 1rem;
  overflow: hidden;
  border: 1px solid #0b34451c;
  border-radius: 10px;
  background: #0c1f2b;
}
.code-panel > div {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.6rem 0.8rem;
  color: #c5e7ed;
  background: #173545;
  font-size: 0.82rem;
}
.code-panel button {
  padding: 0.25rem 0.55rem;
  border: 1px solid #78c9d2;
  border-radius: 5px;
  color: #b9edf2;
  background: transparent;
  cursor: pointer;
}
.code-panel pre {
  margin: 0;
  padding: 1rem;
  overflow: auto;
  color: #d9f3f7;
  font-size: 0.82rem;
  line-height: 1.55;
}
.code-panel code {
  color: inherit !important;
}
.code-panel.compact {
  margin-top: 0;
}
.code-panel.compact p {
  padding: 0 0.8rem;
  color: #b7cbd0;
  font-size: 0.82rem;
}
.reference {
  margin: 1rem 0 0;
}
.apply-list {
  padding-left: 1.25rem;
}
.empty-state {
  padding: 3rem;
  text-align: center;
  border: 1px dashed var(--border-color);
  border-radius: 12px;
  color: var(--text-muted);
}
@media (max-width: 1000px) {
  .steps-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .help-toc {
    margin-bottom: 1rem;
  }
}
@media (max-width: 680px) {
  .help-hero,
  .help-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }
  .version-card {
    width: 100%;
    box-sizing: border-box;
  }
  .mode-grid,
  .two-column,
  .example-grid,
  .field-grid {
    grid-template-columns: 1fr;
  }
  .steps-grid {
    grid-template-columns: 1fr;
  }
  .doc-section {
    padding: 1.1rem;
  }
}
</style>
