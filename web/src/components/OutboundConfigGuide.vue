<template>
                  <!-- Configuration Tips -->
                  <div
                    style="
                      margin-bottom: 1.5rem;
                      padding: 1rem;
                      background: rgba(99, 102, 241, 0.08);
                      border-radius: 8px;
                      border-left: 3px solid var(--primary);
                    "
                  >
                    <div
                      style="
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                        margin-bottom: 0.5rem;
                      "
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                      <strong style="color: var(--primary); font-size: 0.95rem"
                        >配置指南</strong
                      >
                    </div>
                    <ul
                      style="
                        margin: 0;
                        padding-left: 1.5rem;
                        color: var(--text-muted);
                        font-size: 0.85rem;
                        line-height: 1.6;
                      "
                    >
                      <li>
                        <strong>基础出站</strong
                        >：direct(直连)、block(阻断)、dns(DNS查询)、selector/urltest(策略组)
                      </li>
                      <li>
                        <strong>代理节点</strong
                        >：VMess、VLESS、Trojan、Shadowsocks等代理服务器
                      </li>
                      <li>
                        <strong>出站组</strong
                        >：在"分流出站组"页面创建后引入使用
                      </li>
                      <li>
                        💡 <strong>推荐流程</strong>：① 添加代理节点 → ②
                        创建/引入出站组 → ③ 在路由规则中配置分流
                      </li>
                    </ul>
                  </div>
</template>

