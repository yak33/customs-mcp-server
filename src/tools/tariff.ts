/**
 * Tool definition for the tariff lookup capability.
 *
 * @author ZHANGCHAO
 */

import { z } from "zod";

import { queryTariff } from "../api/tariff.js";
import { resolveIdentity, type IdentityOverride } from "../identity.js";
import {
  type ExecutionContext,
  type ToolDefinition,
  type ToolInput,
  requireAtLeastOne,
  withIdentity,
} from "./_common.js";

export function tariffQueryTool(): ToolDefinition {
  return {
    name: "customs_query_tariff",
    description:
      "Look up tariff information by HS code (商品编号) or product name " +
      "(supports fuzzy matching). At least one of `hscode` / `hsname` is required.",
    inputSchema: withIdentity({
      hscode: z
        .string()
        .trim()
        .optional()
        .describe('HS code (商品编号), e.g. "8471300000"'),
      hsname: z
        .string()
        .trim()
        .optional()
        .describe("Product name; supports fuzzy matching"),
    }),
    async handler(input: ToolInput, ctx: ExecutionContext) {
      const identity = resolveIdentity(
        input._identity as IdentityOverride,
        ctx.config.identity,
      );
      requireAtLeastOne(
        { hscode: input.hscode, hsname: input.hsname },
        "Either `hscode` or `hsname` must be provided.",
      );
      return queryTariff(ctx, identity, {
        hscode: input.hscode as string | undefined,
        hsname: input.hsname as string | undefined,
      });
    },
  };
}
