# Changelog

All notable changes to `@dearmrzhang/customs-mcp-server` are documented in this file.

Format inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [SemVer](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-05-24

**Milestone release: full 13-capability coverage with production-grade auth.**

### ⚠️ Breaking changes

- **Identity is now required**. Every backend call goes through
  `/session/exchange` to mint a short-lived `agentToken`. Three new env
  vars are MANDATORY:
  ```
  CUSTOMS_DEFAULT_PLATFORM=<platform>
  CUSTOMS_DEFAULT_EXTERNAL_USER_ID=<bound user>
  CUSTOMS_DEFAULT_EXTERNAL_CORP_ID=<bound corp>
  ```
  Existing v0.1.x deployments will fail at startup until these are
  configured. See [docs/identity-binding.md](docs/identity-binding.md)
  for the backend SQL setup.

- **Tool rename**: `customs_query_tariff_info` → `customs_query_tariff`.
  Update your client configs accordingly.

- **`customs_get_declaration_detail` input schema** changed from a single
  `cusCiqNo` field to four optional lookup keys (`decId`, `entryId`,
  `customsNo`, `seqNo`). Existing callers that used `cusCiqNo` should
  switch to `entryId` (or `decId` when known).

### ✨ Added

- 8 new MCP tools:
  - `customs_query_ship_info` — single-bill ship & container tracking,
    with **client-side I→E auto-fallback** (the backend does not auto-
    fallback for this endpoint and may return a misleading stub response;
    we detect it via `hasRealShipInfo`)
  - `customs_query_ship_plan` — container ship plan by vessel + voyage
  - `customs_query_manifest_info` — manifest arrival (sea + air) with
    optional local-state sync side effects
  - `customs_query_ship_manifest_info` — sea-specific manifest box query
  - `customs_query_dual_use_item` — dual-use / export-control screening
    (slow AI-backed query, default 660 s timeout)
  - `customs_create_order_draft` — order draft pre-check (no persistence
    yet — gated behind future `confirmCreate`)
  - `customs_submit_ai_maker` — AI-powered declaration generation
    (multipart upload, no-wait, returns `decId` immediately)
  - `customs_get_ai_maker_status` — poll AI-maker job status by `decId`
- `_identity?` override field on every tool input schema (optional;
  overrides env defaults per call)
- Tiered timeouts: 15 s read / 180 s upload / 660 s slow query
- Structured error model with English translation layer
  (`NEED_BIND`/`NEED_TENANT`/`UNSUPPORTED_FORMAT`/etc. → actionable
  guidance via [errors/translate.ts](src/errors/translate.ts))
- `examples/` directory with ready-to-paste config snippets for
  Claude Desktop / Cursor / Windsurf / Trae / Claude Code

### 🔁 Changed

- Architecture refactor: business logic split into `src/api/*`,
  MCP tool definitions in `src/tools/*`, auth concentrated in
  `src/auth/*`. Old monolithic `customsApiClient.ts` deleted.
- All HTTP calls now go through `HttpClient` with `AbortController`-based
  timeout (was raw `fetch` with no timeout enforcement)
- `GrantBroker` caches `agentToken` in-process for ~5 minutes with
  concurrent-exchange de-duplication via in-flight `Map`
- TypeScript `strict` mode enforced; whole codebase type-checks clean

### 🧰 Internal

- Zero new runtime dependencies (still just `@modelcontextprotocol/sdk`,
  `zod`, `dotenv` — kept off `form-data`/`node-fetch` by using Node 18+
  built-in `FormData`/`Blob`/`fetch`)
- ~3400 lines of TypeScript, ~50 % docstring/comments
- Node 18+ required (was already implicit; now explicit in `engines`)

---

## [0.1.2] — 2025

Initial public release on npm.

- 6 read-only MCP tools (declaration status / list / detail / IE status /
  tariff info / full-process tracking)
- Direct static `accessKey + MD5` signing — no agent grant, no tenant
  isolation
- stdio + Streamable HTTP transports
- Single-file `customsApiClient.ts` business layer

---

[1.0.0]: https://github.com/yak33/customs-mcp-server/releases/tag/v1.0.0
[0.1.2]: https://github.com/yak33/customs-mcp-server/releases/tag/v0.1.2
