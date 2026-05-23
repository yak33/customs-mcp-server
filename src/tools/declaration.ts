/**
 * Tool definitions for declaration / IE-status / full-process tracking.
 *
 * Five tools in this file (all share `agent:declaration:*` and
 * `agent:tracking:*` action codes on the backend):
 *
 *   - customs_get_declaration_status
 *   - customs_query_declaration_list
 *   - customs_get_declaration_detail
 *   - customs_get_import_export_status
 *   - customs_get_full_process_tracking
 *
 * @author ZHANGCHAO
 */

import { z } from "zod";

import {
  queryDeclarationDetail,
  queryDeclarationList,
  queryDeclarationStatus,
  queryFullProcessTracking,
  queryImportExportStatus,
} from "../api/declaration.js";
import { resolveIdentity, type IdentityOverride } from "../identity.js";
import {
  type ExecutionContext,
  type ToolDefinition,
  type ToolInput,
  requireAtLeastOne,
  withIdentity,
} from "./_common.js";

// ─────────────────────────────────────────────────────────────────
// customs_get_declaration_status
// ─────────────────────────────────────────────────────────────────

export function declarationStatusTool(): ToolDefinition {
  return {
    name: "customs_get_declaration_status",
    description:
      "Query the current filing status of a customs declaration by " +
      "entry ID (海关 18-digit number) or unified sequence number.",
    inputSchema: withIdentity({
      entryId: z
        .string()
        .trim()
        .optional()
        .describe("Customs entry ID (18-digit clearance number)"),
      seqNo: z
        .string()
        .trim()
        .optional()
        .describe("Unified sequence number (统一编号)"),
    }),
    async handler(input: ToolInput, ctx: ExecutionContext) {
      const identity = resolveIdentity(
        input._identity as IdentityOverride,
        ctx.config.identity,
      );
      requireAtLeastOne(
        { entryId: input.entryId, seqNo: input.seqNo },
        "Either `entryId` or `seqNo` must be provided.",
      );
      return queryDeclarationStatus(ctx, identity, {
        entryId: input.entryId as string | undefined,
        seqNo: input.seqNo as string | undefined,
      });
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// customs_query_declaration_list
// ─────────────────────────────────────────────────────────────────

export function declarationListTool(): ToolDefinition {
  return {
    name: "customs_query_declaration_list",
    description:
      "Search the customs declaration list by import/export flag, entry ID, " +
      "bill-of-lading number, or date range. At least one filter is required.",
    inputSchema: withIdentity({
      ieFlag: z
        .enum(["I", "E"])
        .optional()
        .describe("Import (I) or Export (E)"),
      entryId: z
        .string()
        .trim()
        .optional()
        .describe("Entry ID or unified sequence number"),
      billNo: z
        .string()
        .trim()
        .optional()
        .describe("Bill of lading number (提运单号)"),
      beginTime: z
        .string()
        .trim()
        .optional()
        .describe("Start date in yyyy-MM-dd format"),
      endTime: z
        .string()
        .trim()
        .optional()
        .describe("End date in yyyy-MM-dd format"),
    }),
    async handler(input: ToolInput, ctx: ExecutionContext) {
      const identity = resolveIdentity(
        input._identity as IdentityOverride,
        ctx.config.identity,
      );
      requireAtLeastOne(
        {
          entryId: input.entryId,
          billNo: input.billNo,
          beginTime: input.beginTime,
          endTime: input.endTime,
        },
        "At least one of `entryId`, `billNo`, `beginTime`, `endTime` is required.",
      );
      return queryDeclarationList(ctx, identity, {
        ieFlag: input.ieFlag as "I" | "E" | undefined,
        entryId: input.entryId as string | undefined,
        billNo: input.billNo as string | undefined,
        beginTime: input.beginTime as string | undefined,
        endTime: input.endTime as string | undefined,
      });
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// customs_get_declaration_detail
// ─────────────────────────────────────────────────────────────────

export function declarationDetailTool(): ToolDefinition {
  return {
    name: "customs_get_declaration_detail",
    description:
      "Get the full declaration record (header / body / containers / " +
      "supporting documents). Prefer `decId` if you have it (e.g. from " +
      "ai-maker). The backend tries local DB first; `seqNo` triggers " +
      "third-party fallback when local data is missing.",
    inputSchema: withIdentity({
      decId: z
        .string()
        .trim()
        .optional()
        .describe(
          "Internal declaration ID returned by customs_submit_ai_maker — preferred lookup key",
        ),
      entryId: z.string().trim().optional().describe("Customs entry ID"),
      customsNo: z
        .string()
        .trim()
        .optional()
        .describe("Customs declaration number (alias of entryId)"),
      seqNo: z
        .string()
        .trim()
        .optional()
        .describe("Unified sequence number; used for third-party fallback"),
    }),
    async handler(input: ToolInput, ctx: ExecutionContext) {
      const identity = resolveIdentity(
        input._identity as IdentityOverride,
        ctx.config.identity,
      );
      requireAtLeastOne(
        {
          decId: input.decId,
          entryId: input.entryId,
          customsNo: input.customsNo,
          seqNo: input.seqNo,
        },
        "Provide one of `decId`, `entryId`, `customsNo`, or `seqNo`.",
      );
      return queryDeclarationDetail(ctx, identity, {
        decId: input.decId as string | undefined,
        entryId: input.entryId as string | undefined,
        customsNo: input.customsNo as string | undefined,
        seqNo: input.seqNo as string | undefined,
      });
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// customs_get_import_export_status
// ─────────────────────────────────────────────────────────────────

export function importExportStatusTool(): ToolDefinition {
  return {
    name: "customs_get_import_export_status",
    description:
      "Track the import/export flow status of a declaration or bill of lading. " +
      "When `ieFlag` is omitted, the backend tries I first then E automatically.",
    inputSchema: withIdentity({
      ieFlag: z
        .enum(["I", "E"])
        .optional()
        .describe("Import (I) or Export (E); omit for auto-fallback"),
      entryId: z.string().trim().optional().describe("Customs entry ID"),
      billNo: z.string().trim().optional().describe("Bill of lading number"),
    }),
    async handler(input: ToolInput, ctx: ExecutionContext) {
      const identity = resolveIdentity(
        input._identity as IdentityOverride,
        ctx.config.identity,
      );
      requireAtLeastOne(
        { entryId: input.entryId, billNo: input.billNo },
        "Either `entryId` or `billNo` must be provided.",
      );
      return queryImportExportStatus(ctx, identity, {
        ieFlag: input.ieFlag as "I" | "E" | undefined,
        entryId: input.entryId as string | undefined,
        billNo: input.billNo as string | undefined,
      });
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// customs_get_full_process_tracking
// ─────────────────────────────────────────────────────────────────

export function fullProcessTrackingTool(): ToolDefinition {
  return {
    name: "customs_get_full_process_tracking",
    description:
      "End-to-end customs clearance tracking from filing to release. " +
      "When `ieFlag` is omitted, the backend tries I first then E automatically.",
    inputSchema: withIdentity({
      ieFlag: z.enum(["I", "E"]).optional().describe("Import (I) or Export (E)"),
      billNo: z.string().trim().optional().describe("Bill of lading number"),
      customsNo: z
        .string()
        .trim()
        .optional()
        .describe("Customs declaration number"),
    }),
    async handler(input: ToolInput, ctx: ExecutionContext) {
      const identity = resolveIdentity(
        input._identity as IdentityOverride,
        ctx.config.identity,
      );
      requireAtLeastOne(
        { billNo: input.billNo, customsNo: input.customsNo },
        "Either `billNo` or `customsNo` must be provided.",
      );
      return queryFullProcessTracking(ctx, identity, {
        ieFlag: input.ieFlag as "I" | "E" | undefined,
        billNo: input.billNo as string | undefined,
        customsNo: input.customsNo as string | undefined,
      });
    },
  };
}
