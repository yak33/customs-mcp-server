/**
 * Identity resolution: env defaults + per-tool override.
 *
 * Every customs operation needs an *identity* — a (platform, externalUserId,
 * externalCorpId) triple that the backend uses to look up the system user
 * and tenant in `agent_identity_binding`.
 *
 * MCP server supports two modes (both can coexist):
 *
 *   1. **Server-default**: env vars `CUSTOMS_DEFAULT_PLATFORM` /
 *      `CUSTOMS_DEFAULT_EXTERNAL_USER_ID` / `CUSTOMS_DEFAULT_EXTERNAL_CORP_ID`.
 *      Suitable for personal Claude Desktop / Cursor setups where one machine
 *      maps to one customs user.
 *
 *   2. **Per-call override**: each tool input schema includes a `_identity?`
 *      field. When provided, individual fields override the env defaults;
 *      missing fields fall back to the defaults. Suitable for multi-tenant
 *      HTTP MCP servers shared across users.
 *
 * Resolution order: override field > env default > error (only if both empty
 * for a required field — which today is just {platform, externalUserId,
 * externalCorpId}; channel auto-falls-back to platform).
 *
 * @author ZHANGCHAO
 */

import { z } from "zod";

import type { IdentityDefaults } from "./config.js";
import { ConfigError } from "./errors/types.js";

// ─────────────────────────────────────────────────────────────────
// Zod schema embedded in every tool's input schema
// ─────────────────────────────────────────────────────────────────

/**
 * Optional override block injected into each tool's input schema as
 * `_identity?: { platform?, externalUserId?, externalCorpId? }`.
 *
 * The underscore prefix signals "meta field, not a business parameter".
 */
export const IdentityOverrideSchema = z
  .object({
    platform: z.string().trim().min(1).optional()
      .describe('Override default platform (e.g. "claude-code", "cursor")'),
    externalUserId: z.string().trim().min(1).optional()
      .describe("Override default external user identifier"),
    externalCorpId: z.string().trim().min(1).optional()
      .describe("Override default external corp / app identifier"),
    channel: z.string().trim().min(1).optional()
      .describe("Override default channel; falls back to platform"),
  })
  .optional()
  .describe(
    "Optional identity override. Useful when one MCP server instance is shared " +
    "by multiple users — each tool call can specify a distinct customs identity.",
  );

export type IdentityOverride = z.infer<typeof IdentityOverrideSchema>;

// ─────────────────────────────────────────────────────────────────
// Resolved identity (frozen, ready to send on `/session/exchange`)
// ─────────────────────────────────────────────────────────────────

export interface ResolvedIdentity {
  readonly platform: string;
  readonly externalUserId: string;
  readonly externalCorpId: string;
  readonly channel: string;
}

/**
 * Resolve the effective identity for a tool call.
 *
 * @param override  CLI / tool-input override (may be undefined or partial)
 * @param defaults  Server-level defaults loaded from env at startup
 * @returns a frozen {@link ResolvedIdentity}
 * @throws {ConfigError} if a required field is missing from both override and defaults
 */
export function resolveIdentity(
  override: IdentityOverride,
  defaults: IdentityDefaults,
): ResolvedIdentity {
  const platform = pick(override?.platform, defaults.platform, "platform");
  const externalUserId = pick(
    override?.externalUserId,
    defaults.externalUserId,
    "externalUserId",
  );
  const externalCorpId = pick(
    override?.externalCorpId,
    defaults.externalCorpId,
    "externalCorpId",
  );
  const channel =
    override?.channel?.trim() || defaults.channel || platform;

  return Object.freeze({
    platform,
    externalUserId,
    externalCorpId,
    channel,
  });
}

/**
 * Stable cache key for {@link ResolvedIdentity} — used by `GrantBroker` to
 * key the in-memory `agentToken` cache. Excludes `channel` because the
 * backend grant lookup only depends on (platform, externalUserId).
 */
export function identityCacheKey(identity: ResolvedIdentity): string {
  return `${identity.platform}::${identity.externalUserId}`;
}

// ─────────────────────────────────────────────────────────────────
// Internal
// ─────────────────────────────────────────────────────────────────

function pick(
  overrideValue: string | undefined,
  defaultValue: string,
  fieldName: string,
): string {
  // Treat null / undefined / whitespace-only override as "absent" so the
  // env default takes over. Use `||` (truthy) instead of `??` (nullish) on
  // the trimmed override so empty strings also fall through.
  const trimmedOverride = overrideValue?.trim() ?? "";
  const candidate = (trimmedOverride || defaultValue)?.trim();
  if (!candidate) {
    throw new ConfigError(
      `Identity field "${fieldName}" is required but missing from both ` +
        `tool input (_identity.${fieldName}) and env defaults ` +
        `(CUSTOMS_DEFAULT_${camelToUpperSnake(fieldName)}).`,
      { variable: `CUSTOMS_DEFAULT_${camelToUpperSnake(fieldName)}` },
    );
  }
  return candidate;
}

function camelToUpperSnake(s: string): string {
  return s.replace(/([A-Z])/g, "_$1").toUpperCase();
}
