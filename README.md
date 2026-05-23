<div align="center">

# customs-mcp-server

**Customs operations as MCP tools — drop into any AI agent.**

13 production-grade customs / trade capabilities (declarations, ship info,
tariff, dual-use screening, AI-powered declaration generation, ...)
exposed as standard [Model Context Protocol](https://modelcontextprotocol.io/)
tools for Claude Desktop, Claude Code, Cursor, Windsurf, Trae and any
other MCP-compatible AI client.

[![npm](https://img.shields.io/npm/v/@dearmrzhang/customs-mcp-server)](https://www.npmjs.com/package/@dearmrzhang/customs-mcp-server)
[![Node](https://img.shields.io/node/v/@dearmrzhang/customs-mcp-server)](https://nodejs.org/)
[![License](https://img.shields.io/npm/l/@dearmrzhang/customs-mcp-server)](LICENSE)
[![TypeScript](https://img.shields.io/badge/typescript-strict-blue.svg)](tsconfig.json)
[![MCP](https://img.shields.io/badge/MCP-1.x-purple.svg)](https://modelcontextprotocol.io/)
[![GitHub stars](https://img.shields.io/github/stars/yak33/customs-mcp-server?style=social)](https://github.com/yak33/customs-mcp-server)

**English** · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

</div>

---

## ✨ Features

- **14 MCP tools** — every customs-skill capability exposed as a typed tool with zod-validated input
- **Universal client support** — Claude Desktop / Claude Code / Cursor / Windsurf / Trae / Codex / any MCP client
- **Production auth** — `/session/exchange` → 5-min `agentToken` → action-code whitelist → tenant isolation
- **Per-call identity override** — server-level env default + optional `_identity` field per tool call (multi-user / multi-tenant friendly)
- **AI document maker** — multipart upload, no-wait mode, `decId` polling pattern
- **Error translation** — backend `NEED_BIND` / `NEED_TENANT` / etc. rendered as actionable English guidance
- **Tiered timeouts** — 15 s reads / 180 s upload / 660 s dual-use AI query
- **Zero runtime deps** — `@modelcontextprotocol/sdk` + `zod` + `dotenv` only; Node 18+ built-in `fetch` + `FormData`
- **Dual transport** — stdio (Claude Desktop) and Streamable HTTP (remote / self-hosted)

## 🚀 Quick Start

### 1. Set up the backend identity binding

Ask your customs system admin to insert one row into `agent_identity_binding`
mapping your chosen `(platform, externalUserId)` to an existing `sys_user_id`.
Full SQL in [docs/identity-binding.md](docs/identity-binding.md).

### 2. Configure your AI client

Pick a ready-made config from [`examples/`](examples/):
- [Claude Desktop](examples/claude-desktop.json)
- [Cursor](examples/cursor.json)
- [Windsurf](examples/windsurf.json)
- [Trae](examples/trae.json)
- [Claude Code](examples/claude-code.md)

Or use the generic snippet:

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

### 3. Restart your client and ask

> "Use `customs_query_tariff` to look up HS code 8471300000."

That's it. The AI agent picks the tool, the MCP server signs the request,
exchanges a grant, and returns structured tariff data.

## 🏗 Architecture

```
                      ┌────────────────────────────────┐
                      │  AI client (Claude / Cursor /  │
                      │  Windsurf / Trae / ...)         │
                      └───────────────┬────────────────┘
                                      │ MCP protocol (stdio | HTTP)
                      ┌───────────────▼────────────────┐
                      │  customs-mcp-server             │
                      │                                 │
                      │  • 14 tool handlers             │
                      │  • Identity resolver            │
                      │  • Signer + GrantBroker         │
                      │    (5-min agentToken cache)     │
                      │  • Error translator             │
                      └───────────────┬────────────────┘
                                      │ HTTPS + signed headers
                      ┌───────────────▼────────────────┐
                      │  Customs backend                │
                      │  /open-api/agent/v1/...          │
                      └─────────────────────────────────┘
```

## 📚 Documentation

| Document | What's inside |
|---|---|
| **[CHANGELOG.md](CHANGELOG.md)** | All version changes, including v0.1.2 → v1.0.0 breaking changes |
| **[docs/tool-reference.md](docs/tool-reference.md)** | Complete schema and usage for all 14 tools |
| **[docs/identity-binding.md](docs/identity-binding.md)** | Backend SQL setup, multi-tenant patterns, troubleshooting |
| **[examples/](examples/)** | Ready-to-paste config snippets for 5 AI clients |

## 🛠 Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `CUSTOMS_API_BASE_URL` | ✅ | — | Customs backend root URL |
| `CUSTOMS_ACCESS_KEY` | ✅ | — | Static signature access key |
| `CUSTOMS_SECRET_KEY` | ✅ | — | Static signature secret key |
| `CUSTOMS_DEFAULT_PLATFORM` | ✅ | — | Identity platform (e.g. `mcp` / `cursor`) |
| `CUSTOMS_DEFAULT_EXTERNAL_USER_ID` | ✅ | — | Bound external user identifier |
| `CUSTOMS_DEFAULT_EXTERNAL_CORP_ID` | ✅ | — | Bound external corp identifier |
| `CUSTOMS_API_PREFIX` | | `/open-api/agent` | API path prefix |
| `CUSTOMS_TIMEOUT_MS` | | `15000` | Default request timeout (ms) |
| `CUSTOMS_UPLOAD_TIMEOUT_MS` | | `180000` | AI-maker upload timeout (ms) |
| `CUSTOMS_DUAL_USE_TIMEOUT_MS` | | `660000` | Dual-use slow query timeout (ms) |
| `CUSTOMS_TIMESTAMP_TIMEZONE` | | `Asia/Shanghai` | Timestamp tz (must match backend) |
| `CUSTOMS_DEFAULT_CHANNEL` | | `${PLATFORM}` | Channel field for `/session/exchange` |
| `MCP_HTTP_HOST` | | `0.0.0.0` | HTTP transport bind host |
| `MCP_HTTP_PORT` | | `8787` | HTTP transport port |
| `MCP_HTTP_PATH` | | `/mcp` | HTTP transport endpoint |
| `CUSTOMS_DEBUG` | | `0` | Set `1` for verbose stderr debug logs |

## 🧪 Available Tools

14 tools across 7 domains. Full schema and examples in [tool-reference.md](docs/tool-reference.md).

| Domain | Tools |
|---|---|
| **Declaration** | `customs_get_declaration_status` · `customs_query_declaration_list` · `customs_get_declaration_detail` · `customs_get_import_export_status` · `customs_get_full_process_tracking` |
| **Ship** | `customs_query_ship_info` (with auto I→E fallback) · `customs_query_ship_plan` |
| **Manifest** | `customs_query_manifest_info` · `customs_query_ship_manifest_info` |
| **Tariff** | `customs_query_tariff` |
| **Compliance** | `customs_query_dual_use_item` (slow AI query) |
| **Orders** | `customs_create_order_draft` (pre-check only) |
| **AI Maker** | `customs_submit_ai_maker` · `customs_get_ai_maker_status` |

## ⚠️ Upgrading from v0.1.x

v1.0.0 is a **breaking release** with mandatory new env vars. See
[CHANGELOG.md → 1.0.0](CHANGELOG.md#100--2026-05-24) for the full list.
TL;DR:

1. Add three identity env vars (`CUSTOMS_DEFAULT_PLATFORM` /
   `CUSTOMS_DEFAULT_EXTERNAL_USER_ID` / `CUSTOMS_DEFAULT_EXTERNAL_CORP_ID`)
2. Have your admin insert the matching `agent_identity_binding` row
3. Rename `customs_query_tariff_info` → `customs_query_tariff`
4. Switch `customs_get_declaration_detail` callers from `cusCiqNo` to
   `entryId` (or `decId` when known)

## 🛡 Security

- `CUSTOMS_SECRET_KEY` and cached `agentToken`s never leave server memory
- Per-call `_identity` overrides should not embed PII — they appear in MCP structured responses
- All write tools route through action-code whitelist on the backend
- Cross-tenant `ai-maker` status access is blocked at the backend layer

## 🤝 Contributing

Issues and PRs welcome at [github.com/yak33/customs-mcp-server](https://github.com/yak33/customs-mcp-server/issues).

```bash
git clone https://github.com/yak33/customs-mcp-server.git
cd customs-mcp-server
pnpm install
pnpm build
pnpm dev:stdio      # or dev:http
```

## 📄 License

MIT © [ZHANGCHAO](https://github.com/yak33). See [LICENSE](LICENSE).

## 🙏 Related Projects

- **[customs-skill](https://github.com/yak33/customs-skill)** — the same 13 customs capabilities as an OpenClaw skill for Feishu/Lark integration

---

<div align="center">
<sub>Built with 🦞 by ZHANGCHAO · <a href="CHANGELOG.md">v1.0.0</a> · 2026-05-24</sub>
</div>
