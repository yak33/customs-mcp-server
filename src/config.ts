/**
 * Static configuration loaded from environment variables.
 *
 * Lifecycle:
 *   1. Loaded once at server startup via {@link loadConfig}
 *   2. Frozen and shared across all tool invocations
 *   3. Re-evaluated only on process restart (server is stateless apart from grant cache)
 *
 * v1.0.0 changes vs v0.1.x:
 *   - Adds {@link IdentityDefaults} (4 new env vars) — required for backend grant flow
 *   - Adds upload/dual-use timeout knobs (separate from the default 15s)
 *   - `CUSTOMS_TIMEOUT_MS` kept for backwards compatibility (now == request timeout)
 *
 * @author ZHANGCHAO
 */

import "dotenv/config";
import { ConfigError } from "./errors/types.js";

export type TransportMode = "stdio" | "http";
export type SignAlgorithm = "MD5";

// ─────────────────────────────────────────────────────────────────
// Identity defaults (server-level, may be overridden per tool call)
// ─────────────────────────────────────────────────────────────────

export interface IdentityDefaults {
  /** Bound to `agent_identity_binding.platform` on the backend (e.g. "mcp"). */
  platform: string;
  /** Bound to `agent_identity_binding.external_user_id`. */
  externalUserId: string;
  /** Bound to `agent_identity_binding.external_corp_id` (e.g. "mcp-prod"). */
  externalCorpId: string;
  /** Channel sent on `/session/exchange`; defaults to `platform` when unset. */
  channel: string;
}

// ─────────────────────────────────────────────────────────────────
// Top-level config
// ─────────────────────────────────────────────────────────────────

export interface AppConfig {
  /** Customs backend root URL (no trailing slash). */
  customsApiBaseUrl: string;
  /** OpenAPI prefix, e.g. `/open-api/agent`. */
  customsApiPrefix: string;
  /** Signature access key issued by the backend. */
  customsAccessKey: string;
  /** Signature secret key (KEEP PRIVATE). */
  customsSecretKey: string;
  /** Currently only MD5 is supported by the backend `AuthKit`. */
  customsSignAlgorithm: SignAlgorithm;

  /** Default per-request timeout for read APIs (ms). */
  customsTimeoutMs: number;
  /** AI-maker multipart upload timeout (ms). */
  customsUploadTimeoutMs: number;
  /** Dual-use AI slow query timeout (ms). */
  customsDualUseTimeoutMs: number;

  /** IANA timezone for the `timestamp` signature header (must match backend). */
  customsTimestampTimezone: string;

  /** Identity defaults used when a tool call omits `_identity`. */
  identity: IdentityDefaults;

  // HTTP transport (only relevant in `--transport http` mode)
  httpHost: string;
  httpPort: number;
  httpPath: string;
  httpJsonResponse: boolean;
}

// ─────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────

const DEFAULT_HTTP_PATH = "/mcp";
const DEFAULT_API_PREFIX = "/open-api/agent";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_UPLOAD_TIMEOUT_MS = 180_000;
const DEFAULT_DUAL_USE_TIMEOUT_MS = 660_000;
const DEFAULT_TIMEZONE = "Asia/Shanghai";

// ─────────────────────────────────────────────────────────────────
// Loader
// ─────────────────────────────────────────────────────────────────

export function loadConfig(): AppConfig {
  const algorithm = getOptionalEnv("CUSTOMS_SIGN_ALGORITHM", "MD5").toUpperCase();
  if (algorithm !== "MD5") {
    throw new ConfigError(
      "CUSTOMS_SIGN_ALGORITHM currently supports MD5 only",
      { variable: "CUSTOMS_SIGN_ALGORITHM" },
    );
  }

  const platform = requireEnv("CUSTOMS_DEFAULT_PLATFORM");
  const identity: IdentityDefaults = {
    platform,
    externalUserId: requireEnv("CUSTOMS_DEFAULT_EXTERNAL_USER_ID"),
    externalCorpId: requireEnv("CUSTOMS_DEFAULT_EXTERNAL_CORP_ID"),
    channel: getOptionalEnv("CUSTOMS_DEFAULT_CHANNEL", platform),
  };

  return {
    customsApiBaseUrl: requireEnv("CUSTOMS_API_BASE_URL").replace(/\/+$/, ""),
    customsApiPrefix: normalizeApiPrefix(
      getOptionalEnv("CUSTOMS_API_PREFIX", DEFAULT_API_PREFIX),
    ),
    customsAccessKey: requireEnv("CUSTOMS_ACCESS_KEY"),
    customsSecretKey: requireEnv("CUSTOMS_SECRET_KEY"),
    customsSignAlgorithm: algorithm,

    customsTimeoutMs: parsePositiveInt("CUSTOMS_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    customsUploadTimeoutMs: parsePositiveInt(
      "CUSTOMS_UPLOAD_TIMEOUT_MS",
      DEFAULT_UPLOAD_TIMEOUT_MS,
    ),
    customsDualUseTimeoutMs: parsePositiveInt(
      "CUSTOMS_DUAL_USE_TIMEOUT_MS",
      DEFAULT_DUAL_USE_TIMEOUT_MS,
    ),
    customsTimestampTimezone: getOptionalEnv(
      "CUSTOMS_TIMESTAMP_TIMEZONE",
      DEFAULT_TIMEZONE,
    ),
    identity,

    httpHost: getOptionalEnv("MCP_HTTP_HOST", "0.0.0.0"),
    httpPort: parsePositiveInt("MCP_HTTP_PORT", 8787),
    httpPath: normalizeHttpPath(getOptionalEnv("MCP_HTTP_PATH", DEFAULT_HTTP_PATH)),
    httpJsonResponse: parseBoolean("MCP_HTTP_JSON_RESPONSE", false),
  };
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ConfigError(`Missing required environment variable: ${name}`, {
      variable: name,
    });
  }
  return value;
}

function getOptionalEnv(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function parsePositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new ConfigError(`${name} must be a positive integer`, { variable: name });
  }
  return value;
}

function parseBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return fallback;
  return /^(1|true|yes|on)$/i.test(raw);
}

function normalizeHttpPath(path: string): string {
  if (!path) return DEFAULT_HTTP_PATH;
  return path.startsWith("/") ? path : `/${path}`;
}

function normalizeApiPrefix(prefix: string): string {
  if (!prefix) return DEFAULT_API_PREFIX;
  const normalized = prefix.startsWith("/") ? prefix : `/${prefix}`;
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}
