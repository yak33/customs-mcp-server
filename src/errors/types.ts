/**
 * Error hierarchy for the customs MCP server.
 *
 * Design principles:
 *   1. Every error has a stable `code` string for programmatic handling
 *   2. `context` carries structured details (identity, action, raw upstream response)
 *      that error translators can use to render user-friendly guidance
 *   3. `cause` preserves the original error for stack trace debugging
 *
 * Error codes align with the backend `AuthKit` decision values and the
 * customs-skill SKILL.md error code table, so frontend agents can share
 * the same playbook regardless of which integration they go through.
 *
 * @author ZHANGCHAO
 */

/** Structured context attached to every {@link McpServerError}. */
export interface ErrorContext {
  /** Identity used when the error occurred (helps the translator render guidance). */
  platform?: string;
  externalUserId?: string;
  externalCorpId?: string;
  /** Action code requested when the failure happened. */
  actionCode?: string;
  /** Backend tenant identifier, if known. */
  sysUserId?: string | number;
  tenantId?: string | number;
  /** Missing or invalid config key (for ConfigError). */
  variable?: string;
  /** Raw upstream response payload, preserved when present. */
  upstream?: unknown;
  /** Free-form additional fields. */
  [key: string]: unknown;
}

/**
 * Base class for all errors raised by this MCP server.
 *
 * Subclasses set `code` once; instances carry `context` per occurrence so
 * the translator layer can render rich, actionable messages.
 */
export class McpServerError extends Error {
  /** Stable error code, used by `translate.ts` to pick a guidance template. */
  public readonly code: string;
  /** Structured context for the translator and `structuredContent` MCP output. */
  public readonly context: ErrorContext;

  public constructor(
    message: string,
    code: string,
    context: ErrorContext = {},
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
  }
}

// ─────────────────────────────────────────────────────────────────
// Configuration / argument errors (caller's fault)
// ─────────────────────────────────────────────────────────────────

/** Missing required environment variable or malformed configuration. */
export class ConfigError extends McpServerError {
  public constructor(message: string, context: ErrorContext = {}, cause?: unknown) {
    super(message, "MISSING_CONFIG", context, cause);
  }
}

/** Invalid tool input that argparse-style validators did not catch. */
export class InvalidArgumentError extends McpServerError {
  public constructor(message: string, context: ErrorContext = {}, cause?: unknown) {
    super(message, "INVALID_ARGUMENT", context, cause);
  }
}

// ─────────────────────────────────────────────────────────────────
// Authentication / grant decision errors (backend says no)
// ─────────────────────────────────────────────────────────────────

/** Backend `/session/exchange` returned `decision = NEED_BIND`. */
export class NeedBindError extends McpServerError {
  public constructor(context: ErrorContext = {}) {
    const identityLabel = formatIdentity(context);
    super(
      `Authentication failed: identity ${identityLabel} is not bound to a customs user.`,
      "NEED_BIND",
      context,
    );
  }
}

/** Backend returned `decision = NEED_TENANT` (multi-tenant user, no default set). */
export class NeedTenantError extends McpServerError {
  public constructor(context: ErrorContext = {}) {
    const identityLabel = formatIdentity(context);
    super(
      `Identity ${identityLabel} is associated with multiple tenants; please set a default tenant.`,
      "NEED_TENANT",
      context,
    );
  }
}

// ─────────────────────────────────────────────────────────────────
// File / AI-maker constraint errors
// ─────────────────────────────────────────────────────────────────

/** Submitted file extension not in the AI-maker whitelist. */
export class UnsupportedFormatError extends McpServerError {
  public constructor(message: string, context: ErrorContext = {}) {
    super(message, "UNSUPPORTED_FORMAT", context);
  }
}

/** Submitted files exceed the 10 MiB-per-submission limit. */
export class FileTooLargeError extends McpServerError {
  public constructor(message: string, context: ErrorContext = {}) {
    super(message, "FILE_TOO_LARGE", context);
  }
}

/** AI-maker submit succeeded but no `decId` was returned. */
export class MissingDecIdError extends McpServerError {
  public constructor(message: string, context: ErrorContext = {}) {
    super(message, "MISSING_DEC_ID", context);
  }
}

// ─────────────────────────────────────────────────────────────────
// Transport / upstream errors
// ─────────────────────────────────────────────────────────────────

/** Network failure or upstream timeout (no JSON body to parse). */
export class NetworkError extends McpServerError {
  public constructor(message: string, context: ErrorContext = {}, cause?: unknown) {
    super(message, "NETWORK_ERROR", context, cause);
  }
}

/**
 * Backend returned a non-success JSON response (`success: false`) or a 4xx/5xx
 * HTTP status. The raw upstream payload is preserved in `context.upstream`
 * so high-fidelity clients can inspect the original `code`/`message`.
 */
export class UpstreamError extends McpServerError {
  public constructor(message: string, context: ErrorContext = {}) {
    super(message, "UPSTREAM_ERROR", context);
  }
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function formatIdentity(ctx: ErrorContext): string {
  const platform = ctx.platform ?? "unknown";
  const userId = ctx.externalUserId ?? "unknown";
  return `(platform="${platform}", externalUserId="${userId}")`;
}

/** Type guard for {@link McpServerError}. */
export function isMcpServerError(value: unknown): value is McpServerError {
  return value instanceof McpServerError;
}
