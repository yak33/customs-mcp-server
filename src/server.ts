/**
 * MCP server factory.
 *
 * Responsibilities:
 *   1. Build the shared {@link ExecutionContext} (HTTP client, grant broker, config)
 *   2. Collect tool definitions from the registry
 *   3. Wire each tool to the MCP server with a uniform success/error wrapper
 *
 * v1.0.0 changes vs v0.1.x:
 *   - Routes every call through `GrantBroker` (was: direct signed call, no grant)
 *   - Tool input schemas now include an optional `_identity` override
 *   - Errors thrown by handlers are translated to English guidance and emitted
 *     with `isError: true`, while `structuredContent` preserves the original code
 *
 * @author ZHANGCHAO
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { GrantBroker } from "./auth/grantBroker.js";
import { Signer } from "./auth/signer.js";
import type { AppConfig } from "./config.js";
import { isMcpServerError, McpServerError } from "./errors/types.js";
import { translateError } from "./errors/translate.js";
import { HttpClient, type JeecgResult } from "./http/client.js";
import { logError } from "./logging.js";

import type { ExecutionContext, ToolDefinition } from "./tools/_common.js";
import { aiMakerStatusTool, aiMakerSubmitTool } from "./tools/aiMaker.js";
import {
  declarationDetailTool,
  declarationListTool,
  declarationStatusTool,
  fullProcessTrackingTool,
  importExportStatusTool,
} from "./tools/declaration.js";
import { dualUseQueryTool } from "./tools/dualUse.js";
import {
  manifestInfoTool,
  shipManifestInfoTool,
} from "./tools/manifest.js";
import { orderCreateDraftTool } from "./tools/order.js";
import { shipInfoTool, shipPlanTool } from "./tools/ship.js";
import { tariffQueryTool } from "./tools/tariff.js";

/** Collect every tool definition in display order (this is what `--help` shows). */
function buildToolRegistry(): readonly ToolDefinition[] {
  return [
    // Declaration / IE / tracking (5 tools)
    declarationStatusTool(),
    declarationListTool(),
    declarationDetailTool(),
    importExportStatusTool(),
    fullProcessTrackingTool(),
    // Ship (2 tools)
    shipInfoTool(),
    shipPlanTool(),
    // Manifest (2 tools — with optional local state sync side effects)
    manifestInfoTool(),
    shipManifestInfoTool(),
    // Tariff (1 tool)
    tariffQueryTool(),
    // Dual-use item screening (1 tool, slow query)
    dualUseQueryTool(),
    // Order draft (1 tool — currently pre-check only)
    orderCreateDraftTool(),
    // AI maker (2 tools — submit no-wait + status)
    aiMakerSubmitTool(),
    aiMakerStatusTool(),
  ];
}

/** Build the per-instance execution context (single set of shared resources). */
function buildExecutionContext(config: AppConfig): ExecutionContext {
  const signer = new Signer(
    config.customsAccessKey,
    config.customsSecretKey,
    config.customsTimestampTimezone,
  );
  const http = new HttpClient(config, signer);
  const grant = new GrantBroker(http, config.identity.externalCorpId);
  return { config, http, grant };
}

// ─────────────────────────────────────────────────────────────────
// MCP server factory
// ─────────────────────────────────────────────────────────────────

export function createCustomsMcpServer(config: AppConfig): McpServer {
  const server = new McpServer({
    name: "customs-mcp-server",
    version: "1.0.0",
  });
  const ctx = buildExecutionContext(config);

  for (const tool of buildToolRegistry()) {
    server.tool(
      tool.name,
      tool.description,
      tool.inputSchema,
      async (input) => {
        try {
          const result = await tool.handler(input, ctx);
          return toSuccessResult(result);
        } catch (error) {
          return toErrorResult(error, tool.name);
        }
      },
    );
  }

  return server;
}

// ─────────────────────────────────────────────────────────────────
// Result adapters
// ─────────────────────────────────────────────────────────────────

function toSuccessResult(payload: JeecgResult) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload as Record<string, unknown>,
    isError: payload.success === false,
  };
}

function toErrorResult(error: unknown, toolName: string) {
  if (isMcpServerError(error)) {
    const text = translateError(error);
    return {
      content: [{ type: "text" as const, text }],
      structuredContent: serializeError(error),
      isError: true,
    };
  }

  // Unexpected error — log and surface as best-effort
  const message =
    error instanceof Error ? error.message : String(error);
  logError("tool.unexpected_error", { tool: toolName, message });
  return {
    content: [
      {
        type: "text" as const,
        text: `Unexpected error in ${toolName}: ${message}`,
      },
    ],
    structuredContent: { code: "UNEXPECTED_ERROR", message },
    isError: true,
  };
}

function serializeError(error: McpServerError): Record<string, unknown> {
  return {
    code: error.code,
    message: error.message,
    ...error.context,
  };
}
