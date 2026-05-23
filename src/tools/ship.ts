/**
 * Tool definitions for ship-info / ship-plan (2 tools).
 *
 * @author ZHANGCHAO
 */

import { z } from "zod";

import { queryShipInfo, queryShipPlan } from "../api/ship.js";
import { resolveIdentity, type IdentityOverride } from "../identity.js";
import {
  type ExecutionContext,
  type ToolDefinition,
  type ToolInput,
  withIdentity,
} from "./_common.js";

// ─────────────────────────────────────────────────────────────────
// customs_query_ship_info
// ─────────────────────────────────────────────────────────────────

export function shipInfoTool(): ToolDefinition {
  return {
    name: "customs_query_ship_info",
    description:
      "Get single-bill ship and container tracking info (port arrival, " +
      "manifest, tally, inspection, supervision, release, etc). " +
      "When `ieFlag` is omitted, the server tries I first then falls back to E " +
      "only if I returned no real data (a non-stub `baseInfo`-only response).",
    inputSchema: withIdentity({
      ieFlag: z
        .enum(["I", "E"])
        .optional()
        .describe("Import (I) or Export (E); omit for auto client-side fallback"),
      billNo: z.string().trim().min(1).describe("Bill of lading number (required)"),
      shipName: z
        .string()
        .trim()
        .optional()
        .describe("Transport vessel name; used by backend to backfill baseInfo"),
      voyage: z
        .string()
        .trim()
        .optional()
        .describe("Voyage number; used by backend to backfill baseInfo"),
    }),
    async handler(input: ToolInput, ctx: ExecutionContext) {
      const identity = resolveIdentity(
        input._identity as IdentityOverride,
        ctx.config.identity,
      );
      return queryShipInfo(ctx, identity, {
        ieFlag: input.ieFlag as "I" | "E" | undefined,
        billNo: input.billNo as string,
        shipName: input.shipName as string | undefined,
        voyage: input.voyage as string | undefined,
      });
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// customs_query_ship_plan
// ─────────────────────────────────────────────────────────────────

export function shipPlanTool(): ToolDefinition {
  return {
    name: "customs_query_ship_plan",
    description:
      "Get the container ship plan associated with a transport vessel " +
      "(returns array of legs). Requires explicit ieFlag + shipName + voyage. " +
      "For Import (I), backend queries by JKHC; for Export (E), by CKHC.",
    inputSchema: withIdentity({
      ieFlag: z.enum(["I", "E"]).describe("Import (I) or Export (E); required"),
      shipName: z
        .string()
        .trim()
        .min(1)
        .describe("Transport vessel name / English ship name"),
      voyage: z.string().trim().min(1).describe("Voyage number"),
    }),
    async handler(input: ToolInput, ctx: ExecutionContext) {
      const identity = resolveIdentity(
        input._identity as IdentityOverride,
        ctx.config.identity,
      );
      return queryShipPlan(ctx, identity, {
        ieFlag: input.ieFlag as "I" | "E",
        shipName: input.shipName as string,
        voyage: input.voyage as string,
      });
    },
  };
}
