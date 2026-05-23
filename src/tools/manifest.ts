/**
 * Tool definitions for manifest-info / ship-manifest-info (2 tools).
 *
 * Both tools accept optional declaration identifiers to trigger a backend-side
 * sync of local `DecHead.hasCd` / `hasYd` flags. Pure queries (no declaration
 * identifier) only return the manifest data without modifying local state.
 *
 * @author ZHANGCHAO
 */

import { z } from "zod";

import { queryManifestInfo, queryShipManifestInfo } from "../api/manifest.js";
import { resolveIdentity, type IdentityOverride } from "../identity.js";
import {
  type ExecutionContext,
  type ToolDefinition,
  type ToolInput,
  requireAtLeastOne,
  withIdentity,
} from "./_common.js";

// ─────────────────────────────────────────────────────────────────
// Reusable schema fragment: declaration identifiers (all optional)
// ─────────────────────────────────────────────────────────────────

const DECLARATION_IDENTIFIER_SHAPE = {
  decId: z.string().trim().optional().describe("Internal declaration ID"),
  entryId: z.string().trim().optional().describe("Customs entry ID"),
  customsNo: z.string().trim().optional().describe("Customs declaration number"),
  seqNo: z.string().trim().optional().describe("Unified sequence number"),
  cusCiqNo: z
    .string()
    .trim()
    .optional()
    .describe("Customs CIQ joint inspection number"),
} as const;

// ─────────────────────────────────────────────────────────────────
// customs_query_manifest_info
// ─────────────────────────────────────────────────────────────────

export function manifestInfoTool(): ToolDefinition {
  return {
    name: "customs_query_manifest_info",
    description:
      "Query manifest arrival info (sea or air via transportType=2/5). " +
      "If a declaration identifier is provided AND uniquely matches a local " +
      "declaration, the backend ALSO syncs local DecHead.hasCd, and additionally " +
      "DecHead.hasYd when the first arrival record reads '运抵正常'. " +
      "Omit declaration identifiers for a pure query without side effects.",
    inputSchema: withIdentity({
      portCode: z
        .string()
        .trim()
        .min(1)
        .describe("Customs port code (关区代码) — required"),
      transportType: z
        .enum(["2", "5"])
        .describe("Transport mode: 2=sea, 5=air — required"),
      masterBillNo: z
        .string()
        .trim()
        .optional()
        .describe("Master bill of lading number (总提运单号)"),
      billNo: z
        .string()
        .trim()
        .optional()
        .describe("Bill of lading number (提运单号)"),
      ...DECLARATION_IDENTIFIER_SHAPE,
    }),
    async handler(input: ToolInput, ctx: ExecutionContext) {
      const identity = resolveIdentity(
        input._identity as IdentityOverride,
        ctx.config.identity,
      );
      requireAtLeastOne(
        { masterBillNo: input.masterBillNo, billNo: input.billNo },
        "Either `masterBillNo` or `billNo` must be provided.",
      );
      return queryManifestInfo(ctx, identity, {
        portCode: input.portCode as string,
        transportType: input.transportType as "2" | "5",
        masterBillNo: input.masterBillNo as string | undefined,
        billNo: input.billNo as string | undefined,
        decId: input.decId as string | undefined,
        entryId: input.entryId as string | undefined,
        customsNo: input.customsNo as string | undefined,
        seqNo: input.seqNo as string | undefined,
        cusCiqNo: input.cusCiqNo as string | undefined,
      });
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// customs_query_ship_manifest_info
// ─────────────────────────────────────────────────────────────────

export function shipManifestInfoTool(): ToolDefinition {
  return {
    name: "customs_query_ship_manifest_info",
    description:
      "Sea-specific manifest box query. Requires ieFlag + shipName + voyage + billNo. " +
      "When a declaration identifier is provided and uniquely matches, the backend " +
      "also syncs DecHead.hasCd. Omit declaration identifiers for a pure query.",
    inputSchema: withIdentity({
      ieFlag: z.enum(["I", "E"]).describe("Import (I) or Export (E) — required"),
      shipName: z
        .string()
        .trim()
        .min(1)
        .describe("Vessel name or vessel ID — required"),
      voyage: z.string().trim().min(1).describe("Voyage number — required"),
      billNo: z.string().trim().min(1).describe("Bill of lading number — required"),
      ...DECLARATION_IDENTIFIER_SHAPE,
    }),
    async handler(input: ToolInput, ctx: ExecutionContext) {
      const identity = resolveIdentity(
        input._identity as IdentityOverride,
        ctx.config.identity,
      );
      return queryShipManifestInfo(ctx, identity, {
        ieFlag: input.ieFlag as "I" | "E",
        shipName: input.shipName as string,
        voyage: input.voyage as string,
        billNo: input.billNo as string,
        decId: input.decId as string | undefined,
        entryId: input.entryId as string | undefined,
        customsNo: input.customsNo as string | undefined,
        seqNo: input.seqNo as string | undefined,
        cusCiqNo: input.cusCiqNo as string | undefined,
      });
    },
  };
}
