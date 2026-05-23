/**
 * Lightweight structured logging to stderr.
 *
 * MCP stdio transport reserves stdout exclusively for JSON-RPC frames,
 * so all diagnostic output MUST go to stderr. This module ensures every
 * log line is a single JSON object (machine-parseable) prefixed with a
 * stable namespace.
 *
 * Enable verbose debug logging via `CUSTOMS_DEBUG=1`.
 *
 * @author ZHANGCHAO
 */

const DEBUG_ENABLED =
  /^(1|true|yes|on)$/i.test(process.env.CUSTOMS_DEBUG?.trim() ?? "");

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogFields {
  [key: string]: unknown;
}

/**
 * Emit a single-line JSON log to stderr.
 *
 * Skipped silently for level=`"debug"` unless `CUSTOMS_DEBUG=1` is set,
 * keeping production output clean while preserving rich local diagnostics.
 */
export function log(level: LogLevel, message: string, fields: LogFields = {}): void {
  if (level === "debug" && !DEBUG_ENABLED) return;
  const payload = {
    ts: new Date().toISOString(),
    level,
    ns: "customs-mcp",
    msg: message,
    ...fields,
  };
  try {
    process.stderr.write(JSON.stringify(payload) + "\n");
  } catch {
    // stderr unwritable (e.g. pipe closed) — silently drop, never break main flow
  }
}

export const logDebug = (message: string, fields?: LogFields) => log("debug", message, fields);
export const logInfo = (message: string, fields?: LogFields) => log("info", message, fields);
export const logWarn = (message: string, fields?: LogFields) => log("warn", message, fields);
export const logError = (message: string, fields?: LogFields) => log("error", message, fields);
