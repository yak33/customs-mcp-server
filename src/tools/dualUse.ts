/**
 * Tool definition for the dual-use item screening (1 tool).
 *
 * @author ZHANGCHAO
 */

import { z } from "zod";

import { queryDualUseItem } from "../api/dualUse.js";
import { resolveIdentity, type IdentityOverride } from "../identity.js";
import {
  type ExecutionContext,
  type ToolDefinition,
  type ToolInput,
  withIdentity,
} from "./_common.js";

export function dualUseQueryTool(): ToolDefinition {
  return {
    name: "customs_query_dual_use_item",
    description:
      "Screen a product against the dual-use / export-control catalog. " +
      "This is a SLOW AI-backed query (typically 3-10 minutes); " +
      "the server uses a dedicated extended timeout (CUSTOMS_DUAL_USE_TIMEOUT_MS, " +
      "default 660 s). Ensure your MCP client's tool timeout accommodates this.",
    inputSchema: withIdentity({
      productName: z
        .string()
        .trim()
        .min(1)
        .describe("Product name to screen (商品名称) — required"),
      queryText: z
        .string()
        .trim()
        .min(1)
        .describe(
          "Free-form natural-language query (e.g. '是否属于两用物项?' or " +
          "'Is this subject to export control?') — required",
        ),
    }),
    async handler(input: ToolInput, ctx: ExecutionContext) {
      const identity = resolveIdentity(
        input._identity as IdentityOverride,
        ctx.config.identity,
      );
      return queryDualUseItem(ctx, identity, {
        productName: input.productName as string,
        queryText: input.queryText as string,
      });
    },
  };
}
