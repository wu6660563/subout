# Subout 设计报告：订阅解析、节点测速与 sing-box 配置

> 本文依据当前代码库实现撰写，目标版本为项目内置的 sing-box `1.13.19`（最低支持 `1.12.0`）。文中的“支持”特指 Subout 已经解析、保存或生成的行为；sing-box 本身支持但 Subout 未显式处理的字段，应通过专业模式 JSON 配置，而不能假定订阅导入器会保留。

## 1. 总览

Subout 是一个 Rust 后端与 Vue 前端组成的 sing-box 管理器。订阅 URL 不会原样写进 sing-box 的 `outbounds`；它经过“抓取 → 解码/解析 → 清洗 → SQLite 节点池 → 生成配置 → `sing-box check` → 运行”的管线。

```text
订阅 URL / 本地文件 / URI 文本
        │
        ├─ HTTP(S)：reqwest 抓取、读取流量头
        └─ 文件/原始文本：CLI 直接载入
        │
        ▼
Base64 订阅解码（可选）→ 按行识别 URI → 标准 Outbound
        │                                │
        │                                └─ VMess / VLESS / SS / Trojan / …
        ▼
公告与关键词过滤、Tag 去重、持久化 nodes.raw_json（SQLite）
        │
        ├─ 节点测速：TCP/UDP 探测，或临时 sing-box 的真实 HTTP 测试
        └─ 配置生成：简单模式自动生成 / 专业模式保留 JSON 快照
        │
        ▼
sing-box check -c 临时配置 → generated/sing-box.json → sing-box run -c
```

两个重要结论：

- “Ping”在实现中并非 ICMP `ping`。它是 TCP 建连、针对部分 UDP 协议的 QUIC 报文探测，以及真正经由该节点的 HTTP 请求三种测试。
- 简单模式从数据库中所有已启用节点重新构造完整配置；专业模式以 `base_config` 的六个 JSON 区段为准，是所见即所得的配置快照。

## 2. 关键模块与职责

| 模块 | 职责 |
|---|---|
| `src/lib.rs` | HTTP 订阅下载、`subscription-userinfo` 流量/到期信息解析、URL/文件/文本源分流 |
| `src/parser/mod.rs`、`types.rs`、`utils.rs` | Base64、URI、VMess JSON 的解析以及内部 `Outbound` 序列化模型 |
| `src/fetcher.rs` | 单订阅更新、过滤、唯一 Tag 处理、节点落库 |
| `src/web/nodes.rs` | 节点 API、传输层延迟和基于临时 sing-box 的网页延迟测试 |
| `src/simple_config.rs` | 小白模式的 DNS、入站、出站、路由、远程规则集生成 |
| `src/generator.rs` | 专业模式六区段合成、字段补全/清洗、资源同步与失效引用修复 |
| `src/web/config.rs` | `sing-box check` 校验、配置保存、历史快照与运行配置 API |
| `src/auto_update.rs` | 定时更新订阅、网页测速淘汰失效订阅节点、更新策略组并重启服务 |

## 3. 从订阅地址到节点池

### 3.1 URL 抓取

订阅管理的 `POST /api/subscriptions/fetch` 调用 `fetch_and_update_subscription`。对于启用的订阅，抓取器使用：

- 浏览器风格 User-Agent；
- 最多 10 次 HTTP 重定向；
- 总超时 30 秒；
- `error_for_status()`：HTTP 非 2xx 直接视为抓取失败。

流量信息优先从响应头 `subscription-userinfo`（大小写兼容）读取；若某项不存在，再从正文前 30 行中查找 `subscription-userinfo:`、`subscription-userinfo=` 或注释中的 `upload=` / `expire=`。支持的键为 `upload`、`download`、`total`、`expire`，均保存为整数。解析结果与 `last_fetched` 一起写入 `subscriptions`；错误写入 `last_error`。

CLI 的 `--source` 还支持三类来源：`http(s)://` 走同一抓取器；本地存在的路径读文件；其余内容作为内联节点/订阅文本处理。

### 3.2 内容解码和逐行解析

`parse_subscription` 先尝试把**整个订阅正文**作为 Base64 解码。解码器会删除空白字符，补足填充位，依次尝试标准 Base64 和 URL-safe Base64；失败就将正文当作明文。之后按行调用 `parse_line`。

每一行的识别顺序为：

1. `vmess://`：解码其负载为 JSON，而不是用通用 URL 解析；
2. 特殊 `https://<base64>#tag` 节点：当主体没有 `@` 和 `:`、解码后包含 `@` 时，作为被 Base64 包裹的 HTTP(S) 认证地址处理；
3. 其余行：使用 `url::Url` 解析，由 URI scheme 决定协议；
4. 任何不能解析或未知 scheme 的行静默跳过。

Tag 优先使用 URI `#fragment` 并做百分号解码；缺失时使用 `server:port`。用户名和密码也会做百分号解码。查询字符串会放入 `HashMap`，因此同名参数出现多次时后者覆盖前者。

### 3.3 URI 协议与映射

| URI | 解析出的关键字段 | 支持的附加字段/默认值 |
|---|---|---|
| `socks://` / `socks5://` | `server`、`server_port`、`username`、`password` | 默认端口 `1080` |
| `http://` / `https://` | HTTP 出站与认证信息 | HTTPS、`force_https` 或端口 443 启用 TLS；`sni`/`host` 作为 SNI，`allowInsecure=1/true` 允许不校验证书 |
| `vmess://` | Base64 JSON 中的 `add`、`port`、`id`、`aid`、`ps` | `port` 默认 443、`aid` 默认 0；`tls=tls` 或端口 443 启用 TLS；支持 `ws`、`grpc`、`h2/http` 传输 |
| `vless://uuid@…` | UUID、`flow`、服务端和端口 | `security=tls/reality` 生成 TLS；Reality 读取 `pbk`、`sid`；uTLS 指纹读取 `fp`；默认 `packet_encoding: xudp`；支持 WS/gRPC/H2 |
| `trojan://password@…` | 密码、服务端和端口 | 默认 TLS，只有 `security` 显式且不为 `tls` 时关闭；支持 `allowInsecure` 与 WS/gRPC/H2 |
| `anytls://password@…` | 密码、服务端和端口 | 始终 TLS；支持 `sni`/`host` 与 `allowInsecure` |
| `ss://…` | `method`、`password`、服务端和端口 | 用户信息可为 `method:password` 明文或 Base64；解析不到加密方法即跳过 |
| `hysteria://…` | `auth_str`、上下行带宽、混淆 | `auth` 会尝试 Base64；`up`/`up_mbps`、`down`/`down_mbps` 取数字；`obfs`/`obfs-password`；TLS 始终启用，使用 `insecure` |
| `hysteria2://…` | 密码、上下行带宽、`obfs` 对象 | 密码和混淆密码可尝试 Base64；`obfs` 配合 `obfs-password`/`obfs_password`；TLS 始终启用 |

传输参数的当前实现只覆盖：`type=ws`（`path`、`headers.Host`）、`type=grpc`（`serviceName`）与 `type=http/h2`（`host` 数组和 `path`）。例如 HTTP/2 host 字段为空时仍会生成包含空字符串的数组；这属于当前实现细节，提供方 URI 应尽量提供必要的 `host` 与 `path`。

### 3.4 清洗、过滤和持久化

解析出的节点首先经过 `Outbound::is_announcement`。服务端为 `127.0.0.1`、`0.0.0.0`、`localhost`、`hostloc.com`，或 Tag 包含“公告、提示、通知、到期、流量、官网、购买、地址、订阅、更新、警告、说明、剩余、充值、防失联、电报、群”及相应英文关键字时，会被认定为公告并跳过。

随后 `fetcher` 再按订阅自定义关键词过滤 Tag（JSON 字符串数组优先，失败则按逗号分隔），并重复拦截上述占位服务端。默认 `delete_on_update=true`：更新前删除该订阅旧节点；设为 false 时保留旧节点。所有来源的 Tag 全局唯一，重名自动追加 `-2`、`-3` 等后缀。节点原始 JSON 被保存到 `nodes.raw_json`，并附带协议、服务器、端口、订阅 ID、启用状态及测速缓存。

## 4. 节点“Ping”与真实网页延迟

### 4.1 API 与结果

`POST /api/nodes/ping` 接收节点 ID 列表、可选 `test_type`（`tcp`、`web`、`both`）与可选 `target_url`。未提供 URL 时使用 `http://www.gstatic.com/generate_204`。结果含 `id`、`latency`、`tcp_latency`、`web_latency`，并写回 `nodes`：失败统一记为 `-1`，网页测试会同时保存测试时间和目标 URL。

| 类型 | 算法 | 超时/并发 | 它能证明什么 |
|---|---|---|---|
| `tcp`（默认） | TCP 节点执行 `TcpStream::connect(server:port)`；Hysteria/Hysteria2/TUIC/WireGuard 使用 UDP socket，发送 1200 字节 QUIC Initial 探测并等待回应 | 单节点 2 秒；无全局并发阈值 | 端口可达或 UDP 对端有响应；不验证认证、TLS、协议握手与可访问网站 |
| `web` | 为一个节点创建临时 HTTP 入站和只含该节点的 sing-box，`route.final=proxy`；请求经 `127.0.0.1:随机端口` HTTP 代理到目标 URL | 单任务总计 7 秒；最多并行 8 个 sing-box 进程；HTTP 请求 5 秒 | 节点配置、实际代理链及目标 Web 服务基本可用 |
| `both` | 同时做上述两种；`latency` 优先取网页值、网页失败时回退传输层值 | 同上 | 便于区分“端口可通”与“实际可代理” |

网页测试将节点 Tag 临时改为 `proxy`，加入一个 `direct` 出站，写入临时 JSON 后执行 `sing-box run -c`。它轮询本地监听端口最多约 2 秒，准备成功才创建带 HTTP Proxy 的 reqwest 客户端。HTTP 状态小于 400，或为 `403`、`405`、`429`，均算成功，以避免测试站点的访问策略造成误杀。进程和临时文件由 guard 在退出路径清理。

因此，界面上的“延迟”是端到端 HTTP 首包前的请求耗时，不等价于 ICMP RTT，也不代表带宽、抖动或长时间稳定性。UDP 探测尤其可能因服务器静默丢包而呈现失败；应以网页测试作为节点可用性的主要判断。

### 4.2 自动更新的淘汰策略

定时自动更新依次抓取所有启用订阅、对**非自定义且启用**节点做网页测试，并删除网页测试失败的订阅节点；自定义节点不会被这一流程删除。然后它根据动态筛选条件重算策略组成员，生成新出站、修复已删除 Tag 的路由/DNS 引用，运行 `sing-box check`，保存运行配置与历史，若服务已运行则重启。

这是一项强策略：一次网页测试超时即删除节点，而非仅标记为不可用。对于网络波动较大的环境，应谨慎开启自动更新，或选择稳定、可访问的测试 URL。

## 5. 配置生成与运行生命周期

### 5.1 配置的六个顶层区段

专业模式与保存的历史配置都使用以下完整结构：

```json
{
  "log": {},
  "dns": {},
  "inbounds": [],
  "outbounds": [],
  "route": {},
  "experimental": {}
}
```

保存/预览时生成器会做有限规范化：缺失 `log.level` 补为 `info`、`log.timestamp` 补为 `true`；缺失 DNS `strategy` 补为 `prefer_ipv4`；FakeIP 缺失网段时补 `198.18.0.0/15` 与 `fc00::/18`；缺失 `route.auto_detect_interface` 补为 `true`；不支持 TLS 的出站会移除 `tls`。它不会替用户理解或补全全部 sing-box 字段。

保存前调用 `sing-box check -c <临时文件>`。校验环境注入了三项旧版兼容环境变量；若未找到内核，接口会报告 `command_missing=true` 并放行，因此“保存成功”不必然等同于已由内核验证。运行配置写至应用数据目录下的 `generated/sing-box.json`，再由服务管理器以 `sing-box run -c` 启动。

### 5.2 小白模式生成的固定拓扑

小白模式将所有启用节点加载为独立出站，生成如下骨架：

```text
inbound (tun 或 mixed)
      ↓
route rules ──→ direct / block / proxy / AUTO-Test / 指定节点
                                 │
                  selector(proxy) 与 urltest(AUTO-Test)
                                 ↓
                           已启用节点列表
```

默认出站为 `direct`、`block`、`proxy(selector)`；有节点时额外创建 `AUTO-Test(urltest)`。`proxy` 的成员始终包含 `direct`，有节点时前置 `AUTO-Test` 和所有节点。`AUTO-Test` 的测试 URL 是 `http://cp.cloudflare.com/generate_204`，间隔 `3m`，容差 `50`。

默认规则先执行 `sniff`，再劫持 DNS 协议和 53 端口流量；可选广告规则进入 `block`，私网地址可选 `direct`。`smart` 模式中国域名和中国 IP 直连、境外域名及兜底走目标出站；`gfw` 模式仅境外 geosite 走代理、其余直连；`global`（及未知模式）兜底全部走目标出站。没有启用节点时，目标出站强制降为 `direct`。

## 6. 小白模式参数说明

| 配置路径 | 默认值 | 写入 sing-box 的字段 | 含义与建议 |
|---|---:|---|---|
| `log.level` | `info` | `log.level` | 可取 `trace/debug/info/warn/error/fatal/panic`；无效值回退 `info`。排障用 debug，常态推荐 info/warn。 |
| `log.timestamp` | `true` | `log.timestamp` | 是否在日志中带时间戳。 |
| `log.disabled` | `false` | `log.disabled`（仅 true 时） | 关闭 sing-box 日志；排障时不要关闭。 |
| `log.output` | 空 | `log.output`（非空时） | 日志文件路径。须确保运行账户有写权限。 |
| `dns.mode` | `preset_fakeip` | 决定 DNS 服务器与规则 | `preset_fakeip`/`fakeip` 或 `foreign_dns=fakeip` 启用 FakeIP；其他值使用远程 DNS。 |
| `dns.domestic_dns` | `223.5.5.5` | `dns_local` | 可填裸 IP、`host:port`、`udp://`、`tcp://`、`tls://`、`https://`、`h3://`、`quic://` 或 `local`。空值回退 223.5.5.5。 |
| `dns.foreign_dns` | `fakeip` | `dns_remote`/`dns_fakeip` | 境外解析器；非 FakeIP 且目标为代理时，通过 `proxy` detour 请求。 |
| `inbound.inbound_type` | `tun` | 入站类型 | `tun` 接管系统流量；其他值回退生成 `mixed`（HTTP+SOCKS）入站。 |
| `inbound.mixed_port` | `2080` | `listen_port` | Mixed 模式监听端口；避免与其他服务冲突。 |
| `inbound.allow_lan` | `false` | `listen` | false 监听 `127.0.0.1`；true 监听 `0.0.0.0`，会暴露代理给局域网，应结合防火墙和认证。 |
| `inbound.tun_stack` | `system` | `stack` | 由平台层计算有效值；不同系统的 TUN 能力/权限不同。 |
| `inbound.tun_auto_route` | `true` | `auto_route` | 由 sing-box 安装路由；关闭后需自行配置路由。 |
| `route.mode` | `smart` | DNS/路由规则 | `smart` 国内直连、境外代理；`gfw` 仅境外 geosite 代理；`global` 全局走目标出口。 |
| `route.block_ads` | `true` | 广告 geosite 规则 | 使用远程 `geosite-category-ads-all`，匹配后走 `block`。 |
| `route.bypass_lan` | `true` | `ip_is_private → direct` | 避免 NAS、路由器等私网请求被代理。 |
| `route.default_outbound` | `AUTO-Test` | `route.final`、selector 默认项 | 可选 `direct`、`proxy`、`AUTO-Test` 或已存在节点 Tag；无节点/无效 Tag 会安全回退。 |

小白模式强制 DNS `strategy: ipv4_only`，TUN 地址为 `172.19.0.1/30`，目的是避免双栈泄漏或 IPv6 黑洞；这也意味着需要 IPv6 的网络不适合直接使用该模式。

## 7. 生成配置中实际使用的 sing-box 字段

### 7.1 `log`

`level` 控制最小记录级别，`timestamp` 控制时间，`disabled` 完全禁用，`output` 指定目标文件。应用的服务日志缓存最多保留 1000 行；文件超过约 5 MiB 时重命名为 `.log.1`。

### 7.2 `dns`

| 字段 | 说明 |
|---|---|
| `servers` | DNS 服务列表。生成器支持 `local`、`fakeip`、`udp`、`tcp`、`tls`、`https`、`h3`、`quic`。 |
| `tag` | DNS 服务唯一名，路由规则通过它引用。 |
| `server` / `server_port` / `path` | 上游地址、端口、DoH/HTTP3 路径。仅 URI 明示端口或非默认路径时写入。 |
| `detour` | DNS 请求使用的出站；生成器不会写 `direct`，仅写非空且非 direct 的 Tag。 |
| `inet4_range` | FakeIP IPv4 池，小白模式为 `198.18.0.0/15`。 |
| `rules` | DNS 选择规则。广告规则返回 `NOERROR`；中国/境外 geosite 分别选择本地或远端。 |
| `final` | 无规则匹配时 DNS 服务，小白模式固定 `dns_local`。 |
| `strategy` | 地址族策略，小白模式固定 `ipv4_only`；专业模式默认补 `prefer_ipv4`。 |
| `independent_cache` | 小白模式为 true，让不同 DNS server 使用独立缓存。 |

### 7.3 `inbounds`

| 字段 | 含义 |
|---|---|
| `type: "mixed"` | 同时提供 HTTP 与 SOCKS 入站。 |
| `listen`、`listen_port` | 监听地址与端口。建议非必要不监听 `0.0.0.0`。 |
| `type: "tun"` | 虚拟网卡入站，通常需要管理员/root 权限。 |
| `tag` | 入站名称，可用于路由匹配。 |
| `address` | TUN 虚拟地址/前缀，小白模式仅 IPv4。 |
| `interface_name` | 平台层给出的网卡名（仅非空时写入）。 |
| `auto_route`、`strict_route`、`stack` | TUN 路由自动安装、严格路由与协议栈选择；`strict_route` 和有效 stack 由当前平台实现决定。 |

### 7.4 `outbounds` 与节点参数

公共字段：`type` 表示协议，`tag` 是出站唯一标识，`server` 和 `server_port` 指向节点。`direct` 直连，`block` 拦截，`selector` 由用户/默认选择成员，`urltest` 定时依据网页延迟选成员。

| 类型 | 项目会生成的字段 | 说明 |
|---|---|---|
| `selector` | `tag`、`outbounds`、`default` | `outbounds` 是可选 Tag 列表；`default` 是初始选择。 |
| `urltest` | `tag`、`url`、`interval`、`tolerance`、`outbounds` | 周期性 URL 测试；`tolerance` 是容差，避免微小延迟波动频繁切换。 |
| `http` / `socks` | `username`、`password` | 上游认证；HTTP 出站可含 TLS。 |
| `vmess` | `uuid`、`alter_id`、`security`、`tls`、`transport` | 当前 VMess `security` 固定 `auto`。 |
| `vless` | `uuid`、`flow`、`packet_encoding`、`tls`、`transport` | Reality 与 uTLS 均位于 `tls` 下。 |
| `trojan` / `anytls` | `password`、`tls`；Trojan 还可有 `transport` | 通常以 TLS 为基础。 |
| `shadowsocks` | `method`、`password` | 加密方法与密码。 |
| `hysteria` | `auth_str`、`up_mbps`、`down_mbps`、`obfs`、`tls` | QUIC/UDP 协议参数。 |
| `hysteria2` | `password`、`up_mbps`、`down_mbps`、`obfs:{type,password}`、`tls` | Hysteria2 认证和混淆。 |

TLS 子对象中，`enabled` 开启 TLS；`server_name` 是 SNI；`insecure` 跳过证书验证（只用于受控排障，正常不推荐）；`reality.enabled/public_key/short_id` 对应 Reality；`utls.enabled/fingerprint` 对应浏览器指纹。WS transport 使用 `type/path/headers.Host`，gRPC 使用 `type/service_name`，HTTP/H2 使用 `type/host/path`。

### 7.5 `route`

| 字段 | 说明 |
|---|---|
| `rules` | 有序匹配链，先命中先生效；小白模式按 sniff、DNS 劫持、广告、私网、地域规则、兜底排列。 |
| `action: "sniff"` | 尝试从流量识别域名/协议，为规则匹配提供信息。 |
| `action: "hijack-dns"` | 将 DNS 协议或 53 端口流量交给内置 DNS。 |
| `rule_set` | 引用规则集 Tag，如 `geosite-cn`、`geoip-cn`。 |
| `outbound` | 命中规则后使用的出站 Tag。 |
| `ip_is_private` | 匹配私有 IP。 |
| `auto_detect_interface` | 自动检测出口接口，专业模式默认补 true 以减少回环。 |
| `default_domain_resolver` | 域名解析器，小白模式为 `dns_local`。 |
| `final` | 所有规则未命中的最终出站。 |
| `rule_set`（顶层数组） | 远程规则集定义：`tag/type/format/url/download_detour/update_interval`。小白模式每天更新一次。 |

`experimental` 在小白模式固定为空对象；专业模式会不加改写地保存/合并。它用于 sing-box 的实验性能力时，应以所运行内核版本的官方文档为准。

## 8. 专业模式与参数边界

专业模式 UI/API 允许编辑 `log`、`dns`、`inbounds`、`outbounds`、`route`、`experimental` 六段任意 JSON，校验前只做必要的兼容清洗。项目自带 `resources/schemas.json` 是宽松的 UI 基础 schema：多数区段允许附加属性，节点只强制 `tag/type/server/server_port`。所以专业模式能保留许多新字段，但**不代表订阅 URI 导入器会构造它们**。

以下能力值得特别注意：

- URI 导入器未显式支持 TUIC、WireGuard、ShadowTLS、V2Ray transport、ECH、Mux、dial fields 等；需要手工 JSON 节点或后续扩展解析器。
- `generator::sanitize_outbound_value` 将不支持 TLS 的协议的 `tls` 删除，防止无效配置；专业模式编辑某些前沿协议时应先检查该清洗规则。
- `sing-box check` 是语法/配置校验，不会证明账号有效、远端可达或 TUN 权限完整；部分 TUN、权限或自动重定向类报错被识别为环境限制而在校验 API 中放行。
- 配置/节点 Tag 彼此是引用关系。修改或删除 Tag 后应同步检查 `route.final`、规则 `outbound`、DNS `detour`、策略组 `outbounds`，自动更新虽会修复部分失效引用，手工专业配置仍应主动校验。

## 9. 建议的操作与排障顺序

1. 添加订阅，设置便于识别的标签；保留默认“更新时删除旧节点”，除非明确需要增量累积。
2. 先抓取，检查 `last_error`、流量/到期信息与节点数；若节点数异常，检查是否被公告规则或自定义关键词过滤。
3. 使用 `both` 测试筛选节点。TCP 有值、网页无值时，优先检查 TLS/SNI/Reality/认证/传输参数；两者均无值再检查主机、端口、防火墙和网络。
4. 小白模式中先使用 `smart + bypass_lan + AUTO-Test`；确认可用后再切全局或 TUN。开启 TUN 前确认管理员权限、网卡冲突与原有 sing-box 进程。
5. 专业模式每次修改先预览并执行 `sing-box check`，再保存为历史快照、部署和重启。
6. 自动更新会删除网页测试失败的订阅节点；将测试 URL 选为环境稳定可访问的地址，并在生产使用前验证这一淘汰策略符合预期。

## 10. 相关实现入口

- 订阅下载与流量信息：`src/lib.rs`
- 订阅更新与节点池：`src/fetcher.rs`
- URI 解析和内部节点字段：`src/parser/mod.rs`、`src/parser/types.rs`、`src/parser/utils.rs`
- 延迟测试：`src/web/nodes.rs`
- 小白模式配置：`src/simple_config.rs`
- 专业模式生成/同步：`src/generator.rs`
- 校验、历史和运行配置：`src/web/config.rs`、`src/service.rs`
- 自动更新：`src/auto_update.rs`

