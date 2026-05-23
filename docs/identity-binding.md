# Identity Binding Guide

> How to register the MCP server with the customs backend so its tool
> calls authenticate as a real customs user.

## TL;DR

The customs backend authorizes every action against a row in the
`agent_identity_binding` table. The MCP server identifies itself by
sending three fields to `/session/exchange`:

| Field | Sent as | Backend column |
|---|---|---|
| `platform` | `CUSTOMS_DEFAULT_PLATFORM` env | `platform` |
| `externalUserId` | `CUSTOMS_DEFAULT_EXTERNAL_USER_ID` env | `external_user_id` |
| `externalCorpId` | `CUSTOMS_DEFAULT_EXTERNAL_CORP_ID` env | `external_corp_id` |

The backend looks up `(platform, external_corp_id, external_user_id)`,
finds the matching `sys_user_id` + `default_tenant_id`, and issues a
short-lived `agentToken`. Without a matching row, you'll see a
`NEED_BIND` error from the very first tool call.

## Step-by-step setup

### 1. Decide on your identity values

Pick values that describe your deployment. For a personal Claude Desktop
running on one developer's laptop:

```
platform           = mcp
externalCorpId     = mcp-prod
externalUserId     = <pick a stable handle, e.g. your username>
```

For a multi-client setup where each AI tool gets its own identity:

```
platform           = claude-code    | cursor    | windsurf   | trae
externalCorpId     = <client-prod>
externalUserId     = <stable handle per user>
```

You can later override these per tool call via the `_identity?` field;
the env values just establish the default.

### 2. Insert the binding row

Ask your customs system administrator to run a SQL similar to:

```sql
INSERT INTO agent_identity_binding (
  platform,
  external_corp_id,
  external_user_id,
  sys_user_id,
  default_tenant_id,
  bind_source,
  status,
  remark,
  created_by
) VALUES (
  'mcp',                  -- platform
  'mcp-prod',             -- external_corp_id
  'zhangchao',            -- external_user_id (the value you'll put in env)
  1717435791032336385,    -- sys_user_id (your existing customs system user)
  36,                     -- default_tenant_id (existing tenant)
  'manual',               -- bind_source: anything human-readable
  1,                      -- status = 1 (active)
  'MCP Server binding',   -- remark
  'admin'
);
```

Verify the row is in place:

```sql
SELECT * FROM agent_identity_binding
WHERE platform = 'mcp'
  AND external_user_id = 'zhangchao';
```

### 3. Configure the MCP server env

```bash
# Required
CUSTOMS_DEFAULT_PLATFORM=mcp
CUSTOMS_DEFAULT_EXTERNAL_USER_ID=zhangchao
CUSTOMS_DEFAULT_EXTERNAL_CORP_ID=mcp-prod

# Optional — defaults to the value of platform if unset
CUSTOMS_DEFAULT_CHANNEL=mcp
```

### 4. Smoke test

```bash
node dist/index.js --transport stdio
# In another terminal, send an MCP initialize + tool call, e.g.:
# customs_query_tariff with { "hscode": "8471300000" }
```

If you see `NEED_BIND` in the response, the binding row is missing or
the env values don't match column values exactly (watch for whitespace
and case).

## Multi-tenant scenarios

If a single MCP server instance is shared across users (e.g. a hosted
HTTP MCP service), let each user override the identity per call:

```json
{
  "tool": "customs_query_tariff",
  "arguments": {
    "hscode": "8471300000",
    "_identity": {
      "platform": "cursor",
      "externalUserId": "alice"
    }
  }
}
```

The server merges the override with the env defaults (override wins per
field). You'll need a binding row per `(platform, externalUserId)` pair.

## Multi-tenant users (default_tenant_id)

If a `sys_user_id` belongs to multiple tenants, the backend will return
`NEED_TENANT`. Resolve it by setting `default_tenant_id` on the binding
row — the MCP server will not prompt the end user for a tenant choice.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `NEED_BIND` | Missing or mismatched binding row | Verify `(platform, external_corp_id, external_user_id)` triple exists with `status=1` |
| `NEED_TENANT` | Binding row has no `default_tenant_id` | Set `default_tenant_id` to the user's primary tenant |
| `MISSING_CONFIG` | Required env var not set | Check the three `CUSTOMS_DEFAULT_*` env vars are present and non-empty |
| `UPSTREAM_ERROR` with 401/403 | Signature mismatch (clock skew, wrong secret) | Verify `CUSTOMS_ACCESS_KEY` / `CUSTOMS_SECRET_KEY`; ensure server time is within ±5 min of the backend |

## Security notes

- `CUSTOMS_SECRET_KEY` and the `agentToken` cached in memory should
  never be logged or written to disk. The server emits redacted logs
  by default (just `success`/`code`/`requestId`).
- Per-call `_identity` overrides are visible in the structured response
  contents; do not embed PII in `externalUserId` if the AI client logs
  conversation history.
- The `agent_identity_binding` table is the security boundary — only
  trusted administrators should have INSERT/UPDATE access.
