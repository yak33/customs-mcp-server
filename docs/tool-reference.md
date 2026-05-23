# Tool Reference

> Complete schema and usage reference for all 14 MCP tools exposed by
> `customs-mcp-server` v1.0.0.

Every tool's `arguments` may include an optional `_identity` override
(`{ platform?, externalUserId?, externalCorpId?, channel? }`). When
omitted, the server uses the `CUSTOMS_DEFAULT_*` env defaults. See
[identity-binding.md](identity-binding.md) for setup.

All tools return either:
- **Success**: `content[].text` is a JSON-stringified `JeecgResult`,
  `structuredContent` is the same object, `isError: false`
- **Failure**: `content[].text` is an English guidance message,
  `structuredContent` carries `{ code, message, ...context }`,
  `isError: true`

---

## Declarations & tracking

### `customs_get_declaration_status`

Query the current filing status of a customs declaration.

**Arguments** (at least one of `entryId` / `seqNo` required):
- `entryId?: string` — Customs entry ID (18-digit clearance number)
- `seqNo?: string` — Unified sequence number (统一编号)

### `customs_query_declaration_list`

Search the customs declaration list.

**Arguments** (at least one of `entryId` / `billNo` / `beginTime` / `endTime` required):
- `ieFlag?: "I" | "E"` — Import (I) or Export (E)
- `entryId?: string` — Entry ID or unified sequence number
- `billNo?: string` — Bill of lading number
- `beginTime?: string` — Start date `yyyy-MM-dd`
- `endTime?: string` — End date `yyyy-MM-dd`

### `customs_get_declaration_detail`

Get the full declaration record (header / body / containers / docs).

**Arguments** (at least one of `decId` / `entryId` / `customsNo` / `seqNo` required):
- `decId?: string` — Internal declaration ID; preferred lookup key (returned by `customs_submit_ai_maker`)
- `entryId?: string` — Customs entry ID
- `customsNo?: string` — Customs declaration number (alias of `entryId`)
- `seqNo?: string` — Unified sequence number (triggers third-party fallback if local DB misses)

### `customs_get_import_export_status`

Track the import/export flow status of a declaration or bill of lading.
When `ieFlag` is omitted, the backend tries I first then E automatically.

**Arguments** (at least one of `entryId` / `billNo` required):
- `ieFlag?: "I" | "E"` — omit for auto-fallback
- `entryId?: string`
- `billNo?: string`

### `customs_get_full_process_tracking`

End-to-end customs clearance tracking from filing to release.
Same auto-fallback as `ie_status`.

**Arguments** (at least one of `billNo` / `customsNo` required):
- `ieFlag?: "I" | "E"`
- `billNo?: string`
- `customsNo?: string`

---

## Ship & vessel

### `customs_query_ship_info`

Single-bill ship info / container tracking (port arrival, manifest, tally,
inspection, supervision, release, etc).

> **Auto-fallback nuance**: when `ieFlag` is omitted, the MCP server
> tries I first; if the I-side response is a stub `baseInfo`-only echo
> of the query (a "miss"), it transparently retries with E. See
> [src/api/ship.ts](../src/api/ship.ts) `hasRealShipInfo` for the
> hit/miss heuristic.

**Arguments**:
- `billNo: string` — required
- `ieFlag?: "I" | "E"` — omit for client-side auto-fallback
- `shipName?: string` — vessel name (used to backfill `baseInfo`)
- `voyage?: string` — voyage number (used to backfill `baseInfo`)

### `customs_query_ship_plan`

Container ship plan associated with a transport vessel.

**Arguments** (all required):
- `ieFlag: "I" | "E"` — for I, queries JKHC; for E, queries CKHC
- `shipName: string`
- `voyage: string`

---

## Manifest (with optional local state sync)

### `customs_query_manifest_info`

Manifest arrival query (sea or air via `transportType`). When a
declaration identifier is provided AND uniquely matches a local
declaration, the backend ALSO syncs `DecHead.hasCd`, and additionally
`DecHead.hasYd` when the first arrival record reads "运抵正常".
Omit declaration identifiers for a pure query.

**Arguments**:
- `portCode: string` — required (关区代码)
- `transportType: "2" | "5"` — required (2=sea, 5=air)
- `masterBillNo?: string` — total bill of lading
- `billNo?: string` — bill of lading
  (at least one of `masterBillNo` / `billNo` required)
- `decId?: string` / `entryId?: string` / `customsNo?: string` /
  `seqNo?: string` / `cusCiqNo?: string` — optional declaration identifiers

### `customs_query_ship_manifest_info`

Sea-specific manifest box query.

**Arguments**:
- `ieFlag: "I" | "E"` — required
- `shipName: string` — required (vessel name or ID)
- `voyage: string` — required
- `billNo: string` — required
- `decId?: string` / `entryId?: string` / `customsNo?: string` /
  `seqNo?: string` / `cusCiqNo?: string` — optional identifiers (sync `hasCd`)

---

## Tariff & screening

### `customs_query_tariff`

Look up tariff information by HS code or product name.

**Arguments** (at least one required):
- `hscode?: string` — e.g. `"8471300000"`
- `hsname?: string` — product name, fuzzy match

### `customs_query_dual_use_item`

Screen a product against the dual-use / export-control catalog.

> ⚠️ **Slow query**: 3-10 minute typical latency. The server uses a
> dedicated `CUSTOMS_DUAL_USE_TIMEOUT_MS` (default 660 s). Ensure your
> MCP client's tool timeout is at least that long.

**Arguments** (both required):
- `productName: string` — product name (商品名称)
- `queryText: string` — free-form question (e.g. "是否属于两用物项?")

---

## Write operations

### `customs_create_order_draft`

> 🚧 **Pre-check only**. The backend currently validates payload and
> writes an audit row, but does NOT persist a new order. Production
> creation is gated behind a future `confirmCreate` step.

**Arguments**:
- `orderType: string` — e.g. `"PROCURE"`
- `ieFlag: "I" | "E"`
- `buyerName: string`
- `goodsLines: GoodsLine[]` — at least 1 row
  - `pn?` / `hsname?` (one required), `qty` (>0), `qunit?`, `price?`,
    `amount?`, `currency?`
- `currency?: string` / `totalAmount?: number` /
  `contractNo?: string` / `remark?: string`

### `customs_submit_ai_maker`

Submit declaration source documents (invoice, packing list, contract,
bill of lading, etc.) for AI-powered customs declaration generation.

> ⚠️ **No-wait by default**: returns IMMEDIATELY with a `decId`. The
> backend job runs asynchronously (3-10 minutes). Follow up with
> `customs_get_ai_maker_status` until `finished: true`.

**Arguments**:
- `ieFlag: "I" | "E"` — required
- `filePaths: string[]` — 1-10 absolute local paths
  - Total size ≤ **10 MiB** (10 × 1024 × 1024 bytes)
  - Allowed extensions: PDF / Word(doc, docx) / Excel(xls, xlsx) /
    JPG / JPEG / PNG / ZIP / TXT / HTML(html, htm) / RTF

### `customs_get_ai_maker_status`

Query the AI-maker job status by `decId`.

**Arguments** (required):
- `decId: string`

**Returns** (in `result`):
- `finished: boolean` — true on terminal state (success or failure)
- `status?: string` — short status code
- `statusDesc?: string` — Chinese description
- `errorMsg?: string` — populated on failure
- `updateTime?: string`
- `records?: unknown[]` — model audit trail

The backend enforces tenant isolation: a `decId` belonging to a different
tenant returns 403 `UPSTREAM_ERROR`.

---

## Suggested polling pattern for `ai_maker`

In an AI agent loop:

```text
Step 1: customs_submit_ai_maker(ieFlag, filePaths)
        → returns { decId: "1786543210000000001", ... }

Step 2: customs_get_ai_maker_status(decId)
        → if result.finished: done (success if !errorMsg)
        → else: wait 10-30 s, retry from Step 2

Cap at ~30 retries (≈ 10 min) before reporting timeout to the user.
```

The agent (Claude / GPT / etc.) drives the loop, not the MCP server —
this keeps tool calls short and avoids client-side timeouts.

---

## Error codes (full list)

| Code | When emitted | Tool-level guidance |
|---|---|---|
| `MISSING_CONFIG` | Required env var unset at startup | Server fails to start; check env |
| `INVALID_ARGUMENT` | CLI / tool input validation failed | User must fix arguments |
| `NEED_BIND` | `/session/exchange` returned `NEED_BIND` | Admin must add binding row |
| `NEED_TENANT` | Multi-tenant user with no `default_tenant_id` | Admin must set default tenant |
| `UNSUPPORTED_FORMAT` | AI-maker file extension not in whitelist | Convert or remove file |
| `FILE_TOO_LARGE` | AI-maker total > 10 MiB | Split submission |
| `MISSING_DEC_ID` | Submit succeeded but no `decId` returned | Contact admin (upstream bug) |
| `NETWORK_ERROR` | fetch / timeout failure | Retry; check base URL & connectivity |
| `UPSTREAM_ERROR` | Backend `success: false` or HTTP 4xx/5xx | See translated message + original code |
| `UNEXPECTED_ERROR` | Uncaught exception in handler | Open an issue with the request id |

The MCP error translation logic lives in
[src/errors/translate.ts](../src/errors/translate.ts).
