/**
 * Tool definitions for declaration / IE-status / full-process tracking.
 *
 * Five tools in this file (all share `agent:declaration:*` and
 * `agent:tracking:*` action codes on the backend):
 *
 *   - customs_get_declaration_status
 *   - customs_query_declaration_list (v1.1.0: upgraded with statusGroup/decStatus/keyword/pagination)
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
// Status semantic groups (aligned with backend STATUS_BUCKETS)
// ─────────────────────────────────────────────────────────────────

const STATUS_GROUPS = [
  "unsubmitted",
  "notDeclared",
  "declared",
  "submitted",
  "customsAccepted",
  "customsStored",
  "released",
  "closed",
  "returned",
  "inspection",
  "audited",
  "deleted",
] as const;

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
      "Query customs declaration list by status semantic groups (e.g. 'released', 'closed', 'unsubmitted') " +
      "or exact status codes (1/2/4/6/7/8/9/10/11), with optional filters for IE flag, keyword (fuzzy match on " +
      "seqNo/clearanceNo/customsNo/billCode), date range, and pagination. At least one filter is required. " +
      "Use this when the user asks to 'list all released declarations', 'show unsubmitted drafts', " +
      "'find declarations from May', etc.",
    inputSchema: withIdentity({
      statusGroup: z
        .enum(STATUS_GROUPS)
        .optional()
        .describe(
          "Status semantic group: unsubmitted (draft, decStatus=1), declared (submitted, includes 2/4/6/7/8/9/10/11), " +
          "customsAccepted (customs processed, excludes returned/deleted), customsStored (4), released (9), closed (10), " +
          "returned (6), inspection (11), audited (7), deleted (8). Aliases: notDeclared=unsubmitted, submitted=declared.",
        ),
      decStatus: z
        .string()
        .trim()
        .optional()
        .describe(
          "Exact status code: 1 (saved/draft), 2 (declared), 4 (customs stored), 6 (returned), 7 (audited), " +
          "8 (deleted), 9 (released), 10 (closed), 11 (inspection), S/T/U (personal use). Takes precedence over statusGroup.",
        ),
      ieFlag: z
        .enum(["I", "E"])
        .optional()
        .describe("Import (I) or Export (E)"),
      keyword: z
        .string()
        .trim()
        .optional()
        .describe(
          "Fuzzy match on unified sequence number (seqNo), clearance number (clearanceNo), " +
          "customs number (customsNo), or bill of lading (billCode)",
        ),
      startDate: z
        .string()
        .trim()
        .optional()
        .describe("Declaration date start in yyyy-MM-dd format"),
      endDate: z
        .string()
        .trim()
        .optional()
        .describe("Declaration date end in yyyy-MM-dd format"),
      pageNo: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Page number, starts from 1, default 1"),
      pageSize: z
        .number()
        .int()
        .positive()
        .max(100)
        .optional()
        .describe("Page size, default 20, max 100"),
    }),
    async handler(input: ToolInput, ctx: ExecutionContext) {
      const identity = resolveIdentity(
        input._identity as IdentityOverride,
        ctx.config.identity,
      );
      requireAtLeastOne(
        {
          statusGroup: input.statusGroup,
          decStatus: input.decStatus,
          ieFlag: input.ieFlag,
          keyword: input.keyword,
          startDate: input.startDate,
          endDate: input.endDate,
        },
        "At least one filter is required: statusGroup, decStatus, ieFlag, keyword, or date range.",
      );
      return queryDeclarationList(ctx, identity, {
        statusGroup: input.statusGroup as string | undefined,
        decStatus: input.decStatus as string | undefined,
        ieFlag: input.ieFlag as "I" | "E" | undefined,
        keyword: input.keyword as string | undefined,
        startDate: input.startDate as string | undefined,
        endDate: input.endDate as string | undefined,
        pageNo: input.pageNo as number | undefined,
        pageSize: input.pageSize as number | undefined,
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
