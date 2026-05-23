/**
 * Shared types and helpers for MCP tool definitions.
 *
 * Design:
 *   - Every tool file exports a factory function returning a {@link ToolDefinition}
 *   - `server.ts` collects them into a registry and binds them to the MCP server
 *   - Each tool's input schema includes a {@link IdentityOverrideSchema} block,
 *     auto-merged via {@link withIdentity}
 *
 * @author ZHANGCHAO
 */

import type { z } from "zod";

import type { AppConfig } from "../config.js";
import type { GrantBroker } from "../auth/grantBroker.js";
import { InvalidArgumentError } from "../errors/types.js";
import type { HttpClient, JeecgResult } from "../http/client.js";
import { IdentityOverrideSchema } from "../identity.js";

// ─────────────────────────────────────────────────────────────────
// Execution context
// ─────────────────────────────────────────────────────────────────

/**
 * Shared per-call execution context: HTTP client, grant broker, config.
 *
 * Built once per `createCustomsMcpServer` invocation and shared across all
 * tool handlers.
 */
export interface ExecutionContext {
  readonly config: AppConfig;
  readonly http: HttpClient;
  readonly grant: GrantBroker;
}

// ─────────────────────────────────────────────────────────────────
// Tool definition contract
// ─────────────────────────────────────────────────────────────────

/**
 * MCP tool definition produced by each tool factory.
 *
 * `inputSchema` is the raw zod shape (object's `.shape`), not a
 * `ZodObject` — this matches the `McpServer.tool()` signature.
 *
 * `handler` runs business logic and returns the raw {@link JeecgResult};
 * the server-level wrapper translates it into the MCP `ToolResult` form.
 */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodRawShape;
  handler(input: ToolInput, ctx: ExecutionContext): Promise<JeecgResult>;
}

/**
 * Loose input type — each handler casts to its own zod-inferred type at
 * the top of the function (after extracting `_identity`).
 */
export type ToolInput = Record<string, unknown>;

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Augment a tool's input shape with the optional `_identity` field.
 *
 * Usage:
 * ```ts
 * inputSchema: withIdentity({
 *   entryId: z.string().trim().optional(),
 *   seqNo: z.string().trim().optional(),
 * })
 * ```
 */
export function withIdentity<T extends z.ZodRawShape>(shape: T): T & {
  _identity: typeof IdentityOverrideSchema;
} {
  return {
    ...shape,
    _identity: IdentityOverrideSchema,
  };
}

/**
 * Guard for the "at least one of these fields must be provided" pattern.
 * Throws {@link InvalidArgumentError} if all candidates are empty.
 */
export function requireAtLeastOne(
  candidates: Record<string, unknown>,
  message: string,
): void {
  const hasOne = Object.values(candidates).some((value) =>
    value !== null && value !== undefined && value !== "",
  );
  if (!hasOne) {
    throw new InvalidArgumentError(message, { candidates });
  }
}
