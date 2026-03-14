import "dotenv/config";

export type TransportMode = "stdio" | "http";
export type SignAlgorithm = "MD5";

export interface AppConfig {
  customsApiBaseUrl: string;
  customsApiPrefix: string;
  customsAccessKey: string;
  customsSecretKey: string;
  customsSignAlgorithm: SignAlgorithm;
  customsTimeoutMs: number;
  customsTimestampTimezone: string;
  httpHost: string;
  httpPort: number;
  httpPath: string;
  httpJsonResponse: boolean;
}

const DEFAULT_HTTP_PATH = "/mcp";
const DEFAULT_API_PREFIX = "/open-api/agent";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getOptionalEnv(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function parseInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function parseBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  return /^(1|true|yes|on)$/i.test(raw);
}

function normalizeHttpPath(path: string): string {
  if (!path) {
    return DEFAULT_HTTP_PATH;
  }
  return path.startsWith("/") ? path : `/${path}`;
}

function normalizeApiPrefix(prefix: string): string {
  if (!prefix) {
    return DEFAULT_API_PREFIX;
  }
  const normalized = prefix.startsWith("/") ? prefix : `/${prefix}`;
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

export function loadConfig(): AppConfig {
  const algorithm = getOptionalEnv("CUSTOMS_SIGN_ALGORITHM", "MD5").toUpperCase();
  if (algorithm !== "MD5") {
    throw new Error("CUSTOMS_SIGN_ALGORITHM currently supports MD5 only");
  }

  return {
    customsApiBaseUrl: requireEnv("CUSTOMS_API_BASE_URL").replace(/\/+$/, ""),
    customsApiPrefix: normalizeApiPrefix(getOptionalEnv("CUSTOMS_API_PREFIX", DEFAULT_API_PREFIX)),
    customsAccessKey: requireEnv("CUSTOMS_ACCESS_KEY"),
    customsSecretKey: requireEnv("CUSTOMS_SECRET_KEY"),
    customsSignAlgorithm: algorithm,
    customsTimeoutMs: parseInteger("CUSTOMS_TIMEOUT_MS", 15000),
    customsTimestampTimezone: getOptionalEnv("CUSTOMS_TIMESTAMP_TIMEZONE", "Asia/Shanghai"),
    httpHost: getOptionalEnv("MCP_HTTP_HOST", "0.0.0.0"),
    httpPort: parseInteger("MCP_HTTP_PORT", 8787),
    httpPath: normalizeHttpPath(getOptionalEnv("MCP_HTTP_PATH", DEFAULT_HTTP_PATH)),
    httpJsonResponse: parseBoolean("MCP_HTTP_JSON_RESPONSE", false)
  };
}
