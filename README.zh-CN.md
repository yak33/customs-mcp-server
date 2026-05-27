<div align="center">

# customs-mcp-server

**关务能力打包成 MCP 工具 —— 任何 AI Agent 即插即用。**

把 14 个生产级关务/贸易能力(报关单、船信息、税则、两用物项判定、
AI 智能制单 ……)封装成标准 [Model Context Protocol](https://modelcontextprotocol.io/)
工具,供 Claude Desktop、Claude Code、Cursor、Windsurf、Trae 以及其他
任意 MCP 兼容的 AI 客户端直接调用。

[![npm](https://img.shields.io/npm/v/@dearmrzhang/customs-mcp-server)](https://www.npmjs.com/package/@dearmrzhang/customs-mcp-server)
[![Node](https://img.shields.io/node/v/@dearmrzhang/customs-mcp-server)](https://nodejs.org/)
[![License](https://img.shields.io/npm/l/@dearmrzhang/customs-mcp-server)](LICENSE)
[![TypeScript](https://img.shields.io/badge/typescript-strict-blue.svg)](tsconfig.json)
[![MCP](https://img.shields.io/badge/MCP-1.x-purple.svg)](https://modelcontextprotocol.io/)
[![GitHub stars](https://img.shields.io/github/stars/yak33/customs-mcp-server?style=social)](https://github.com/yak33/customs-mcp-server)

[English](README.md) · **简体中文** · [日本語](README.ja.md)

</div>

---

## ✨ 能力

- **14 个 MCP 工具** —— 把每一个 customs-skill 业务能力做成带 zod 校验的类型化工具
- **全 AI 客户端支持** —— Claude Desktop / Claude Code / Cursor / Windsurf / Trae / Codex / 任意 MCP 客户端
- **生产级鉴权** —— `/session/exchange` → 5 分钟 `agentToken` → 动作码白名单 → 租户隔离
- **调用级身份覆盖** —— server 默认身份 + 每次工具调用可选 `_identity` 字段(多用户 / 多租户友好)
- **AI 制单** —— multipart 上传、no-wait 模式、`decId` 轮询模式
- **错误翻译** —— 后端 `NEED_BIND` / `NEED_TENANT` 等翻译成可操作的英文指引
- **分级超时** —— 15 秒读 / 180 秒上传 / 660 秒慢查询
- **零运行时依赖** —— 只用 `@modelcontextprotocol/sdk` + `zod` + `dotenv`;Node 18+ 内置 `fetch` + `FormData`
- **双 Transport** —— stdio(Claude Desktop)与 Streamable HTTP(远程 / 自托管)

## 🚀 快速开始

### 1. 后端绑定身份

请关务系统管理员在 `agent_identity_binding` 表里插入一条记录,
把 `(platform, externalUserId)` 映射到已有 `sys_user_id`。
完整 SQL 见 [docs/identity-binding.md](docs/identity-binding.md)。

### 2. 配置 AI 客户端

从 [`examples/`](examples/) 选一个现成模板:
- [Claude Desktop](examples/claude-desktop.json)
- [Cursor](examples/cursor.json)
- [Windsurf](examples/windsurf.json)
- [Trae](examples/trae.json)
- [Claude Code](examples/claude-code.md)

或者使用通用配置:

```json
{
  "mcpServers": {
    "customs": {
      "command": "npx",
      "args": ["-y", "@dearmrzhang/customs-mcp-server", "--transport", "stdio"],
      "env": {
        "CUSTOMS_API_BASE_URL": "http://your-backend-host:port",
        "CUSTOMS_ACCESS_KEY": "your-access-key",
        "CUSTOMS_SECRET_KEY": "your-secret-key",
        "CUSTOMS_DEFAULT_PLATFORM": "mcp",
        "CUSTOMS_DEFAULT_EXTERNAL_USER_ID": "your-bound-username",
        "CUSTOMS_DEFAULT_EXTERNAL_CORP_ID": "mcp-prod"
      }
    }
  }
}
```

### 3. 重启客户端开始用

> "用 `customs_query_tariff` 查一下 HS 编码 8471300000"

完成。AI Agent 会自动选择工具,MCP Server 签名请求、换 grant、
返回结构化的税则数据。

## 🏗 架构

```
                      ┌────────────────────────────────┐
                      │  AI 客户端(Claude / Cursor /  │
                      │  Windsurf / Trae / ……)         │
                      └───────────────┬────────────────┘
                                      │ MCP 协议(stdio | HTTP)
                      ┌───────────────▼────────────────┐
                      │  customs-mcp-server             │
                      │                                 │
                      │  • 14 个 tool handler           │
                      │  • 身份解析器                   │
                      │  • Signer + GrantBroker         │
                      │    (5 分钟 agentToken 缓存)    │
                      │  • 错误翻译器                   │
                      └───────────────┬────────────────┘
                                      │ HTTPS + 签名头
                      ┌───────────────▼────────────────┐
                      │  关务后端                       │
                      │  /open-api/agent/v1/...          │
                      └─────────────────────────────────┘
```

## 📚 文档

| 文档 | 内容 |
|---|---|
| **[CHANGELOG.md](CHANGELOG.md)** | 所有版本变更,含 v0.1.2 → v1.0.0 破坏性变更、v1.1.0 declaration-list 增强 |
| **[docs/tool-reference.md](docs/tool-reference.md)** | 全部 14 个工具的完整 schema 与用法 |
| **[docs/identity-binding.md](docs/identity-binding.md)** | 后端 SQL 配置、多租户模式、troubleshooting |
| **[examples/](examples/)** | 5 个 AI 客户端的配置示例 |

## 🛠 环境变量

| 变量名 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `CUSTOMS_API_BASE_URL` | ✅ | — | 关务后端根 URL |
| `CUSTOMS_ACCESS_KEY` | ✅ | — | 静态签名 accessKey |
| `CUSTOMS_SECRET_KEY` | ✅ | — | 静态签名 secretKey |
| `CUSTOMS_DEFAULT_PLATFORM` | ✅ | — | 身份 platform(如 `mcp` / `cursor`)|
| `CUSTOMS_DEFAULT_EXTERNAL_USER_ID` | ✅ | — | 绑定的外部用户标识 |
| `CUSTOMS_DEFAULT_EXTERNAL_CORP_ID` | ✅ | — | 绑定的外部企业标识 |
| `CUSTOMS_API_PREFIX` | | `/open-api/agent` | API 路径前缀 |
| `CUSTOMS_TIMEOUT_MS` | | `15000` | 默认请求超时(毫秒)|
| `CUSTOMS_UPLOAD_TIMEOUT_MS` | | `180000` | AI 制单上传超时(毫秒)|
| `CUSTOMS_DUAL_USE_TIMEOUT_MS` | | `660000` | 两用物项慢查询超时(毫秒)|
| `CUSTOMS_TIMESTAMP_TIMEZONE` | | `Asia/Shanghai` | 时间戳时区(与后端一致)|
| `CUSTOMS_DEFAULT_CHANNEL` | | `${PLATFORM}` | `/session/exchange` 的 channel 字段 |
| `MCP_HTTP_HOST` | | `0.0.0.0` | HTTP transport 绑定 host |
| `MCP_HTTP_PORT` | | `8787` | HTTP transport 端口 |
| `MCP_HTTP_PATH` | | `/mcp` | HTTP transport 路径 |
| `CUSTOMS_DEBUG` | | `0` | 设为 `1` 开启 stderr 详细调试日志 |

## 🧪 可用工具

14 个工具,分布在 7 个领域。完整 schema 和示例见 [tool-reference.md](docs/tool-reference.md)。

| 领域 | 工具 |
|---|---|
| **报关单** | `customs_get_declaration_status` · `customs_query_declaration_list` · `customs_get_declaration_detail` · `customs_get_import_export_status` · `customs_get_full_process_tracking` |
| **船信息** | `customs_query_ship_info`(含 I→E 自动兜底)· `customs_query_ship_plan` |
| **舱单** | `customs_query_manifest_info` · `customs_query_ship_manifest_info` |
| **税则** | `customs_query_tariff` |
| **合规** | `customs_query_dual_use_item`(慢 AI 查询)|
| **订单** | `customs_create_order_draft`(预检阶段)|
| **AI 制单** | `customs_submit_ai_maker` · `customs_get_ai_maker_status` |

## ⚠️ 从 v0.1.x 升级

v1.0.0 是**破坏性发布**,引入了新的必填 env 变量。完整变更见
[CHANGELOG.md → 1.0.0](CHANGELOG.md#100--2026-05-24)。TL;DR:

1. 加 3 个身份 env(`CUSTOMS_DEFAULT_PLATFORM` /
   `CUSTOMS_DEFAULT_EXTERNAL_USER_ID` / `CUSTOMS_DEFAULT_EXTERNAL_CORP_ID`)
2. 让管理员在 `agent_identity_binding` 插入对应绑定行
3. 把 `customs_query_tariff_info` 改名为 `customs_query_tariff`
4. 把 `customs_get_declaration_detail` 的调用从 `cusCiqNo` 切到 `entryId`(已知 decId 时优先用 `decId`)

## 🛡 安全

- `CUSTOMS_SECRET_KEY` 和内存中缓存的 `agentToken` 永不出 server 进程
- 调用级 `_identity` 覆盖不要嵌入 PII —— 它会出现在 MCP 结构化响应里
- 所有写操作走后端动作码白名单
- AI 制单状态查询的跨租户访问由后端拦截

## 🤝 贡献

欢迎在 [github.com/yak33/customs-mcp-server](https://github.com/yak33/customs-mcp-server/issues) 提 Issue / PR。

```bash
git clone https://github.com/yak33/customs-mcp-server.git
cd customs-mcp-server
pnpm install
pnpm build
pnpm dev:stdio      # 或 dev:http
```

## 📄 许可证

MIT © [ZHANGCHAO](https://github.com/yak33),详见 [LICENSE](LICENSE)。

## 🙏 相关项目

- **[customs-skill](https://github.com/yak33/customs-skill)** —— 同样这 13 个关务能力的 OpenClaw 飞书/Lark 集成版

---

<div align="center">
<sub>Built with 🦞 by ZHANGCHAO · <a href="CHANGELOG.md">v1.0.0</a> · 2026-05-24</sub>
</div>
