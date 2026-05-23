# Using customs-mcp-server with Claude Code

Claude Code (Anthropic's CLI) connects to MCP servers via its
`mcp.json` configuration. Two ways to wire this up:

## Option A — User-level MCP config

Edit `~/.config/claude-code/mcp.json` (or use `claude mcp add`):

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
        "CUSTOMS_DEFAULT_PLATFORM": "claude-code",
        "CUSTOMS_DEFAULT_EXTERNAL_USER_ID": "your-bound-username",
        "CUSTOMS_DEFAULT_EXTERNAL_CORP_ID": "claude-code-prod"
      }
    }
  }
}
```

Then restart your Claude Code session. The 14 `customs_*` tools
will appear in the tool list.

## Option B — `claude mcp add` interactive setup

```bash
claude mcp add customs \
  -- npx -y @dearmrzhang/customs-mcp-server --transport stdio
```

Follow the prompts to set the env vars. To inspect:

```bash
claude mcp list
claude mcp get customs
```

## Smoke test

In Claude Code, try:

> Use customs_query_tariff to look up HS code 8471300000.

Claude will call the tool with `{ "hscode": "8471300000" }` and show
the structured response.

## Per-call identity override (multi-user setups)

For team-shared backends, ask each user to override the identity in
their prompts:

> Run customs_get_declaration_status with entryId 220120241000000001
> and `_identity` set to `{ "externalUserId": "alice" }`.

Claude Code will pass the override through; the MCP server merges it
with the env defaults. See [docs/identity-binding.md](../docs/identity-binding.md)
for backend setup.

## Available tools

All 14 tools, full schema in [docs/tool-reference.md](../docs/tool-reference.md):

| Tool | What it does |
|---|---|
| `customs_get_declaration_status` | Declaration filing status |
| `customs_query_declaration_list` | List declarations by filters |
| `customs_get_declaration_detail` | Full declaration record |
| `customs_get_import_export_status` | IE flow status |
| `customs_get_full_process_tracking` | End-to-end clearance tracking |
| `customs_query_ship_info` | Single-bill ship + container tracking |
| `customs_query_ship_plan` | Container ship plan |
| `customs_query_manifest_info` | Manifest arrival (sea/air) |
| `customs_query_ship_manifest_info` | Sea-specific manifest box |
| `customs_query_tariff` | Tariff lookup |
| `customs_query_dual_use_item` | Dual-use screening (slow) |
| `customs_create_order_draft` | Order draft pre-check |
| `customs_submit_ai_maker` | AI-powered declaration generation |
| `customs_get_ai_maker_status` | Poll AI-maker job |
