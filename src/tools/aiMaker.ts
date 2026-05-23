/**
 * AI-maker tool definitions (2 tools).
 *
 *   - customs_submit_ai_maker  — multipart upload + immediate `decId` return
 *   - customs_get_ai_maker_status — poll a previously-submitted job
 *
 * Design note: the SUBMIT tool defaults to "no-wait" semantics because
 * MCP tool calls cannot reliably hold a connection open for 3-10 minutes.
 * The AI agent should follow up with `customs_get_ai_maker_status` until
 * `result.finished === true`.
 *
 * @author ZHANGCHAO
 */

import { z } from "zod";

import {
  queryAiMakerStatus,
  submitAiMaker,
} from "../api/aiMaker.js";
import { resolveIdentity, type IdentityOverride } from "../identity.js";
import {
  type ExecutionContext,
  type ToolDefinition,
  type ToolInput,
  withIdentity,
} from "./_common.js";

// ─────────────────────────────────────────────────────────────────
// customs_submit_ai_maker
// ─────────────────────────────────────────────────────────────────

export function aiMakerSubmitTool(): ToolDefinition {
  return {
    name: "customs_submit_ai_maker",
    description:
      "Submit declaration source documents (invoice, packing list, contract, " +
      "bill of lading, etc.) for AI-powered customs declaration generation. " +
      "Returns IMMEDIATELY with a `decId` (declaration tracking ID); the " +
      "model on the backend then runs asynchronously (3-10 minutes). " +
      "Follow up with customs_get_ai_maker_status periodically until " +
      "`finished: true`. Total upload size ≤ 10 MiB. Allowed formats: " +
      "PDF / Word / Excel / JPG / PNG / ZIP / TXT / HTML / RTF.",
    inputSchema: withIdentity({
      ieFlag: z
        .enum(["I", "E"])
        .describe("Import (I) or Export (E) — required"),
      filePaths: z
        .array(z.string().trim().min(1))
        .min(1)
        .max(10)
        .describe(
          "Absolute local paths to source documents. The MCP server reads " +
          "them and uploads via multipart/form-data. Required ≥ 1 file. " +
          "Per-submission total ≤ 10 MiB.",
        ),
    }),
    async handler(input: ToolInput, ctx: ExecutionContext) {
      const identity = resolveIdentity(
        input._identity as IdentityOverride,
        ctx.config.identity,
      );
      return submitAiMaker(ctx, identity, {
        ieFlag: input.ieFlag as "I" | "E",
        filePaths: input.filePaths as string[],
      });
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// customs_get_ai_maker_status
// ─────────────────────────────────────────────────────────────────

export function aiMakerStatusTool(): ToolDefinition {
  return {
    name: "customs_get_ai_maker_status",
    description:
      "Query the AI-maker job status by `decId`. Returns `finished: true` " +
      "with `status: 'FINAL_REVIEW'` on success, `finished: true` with " +
      "non-empty `errorMsg` on failure, or `finished: false` while still " +
      "processing. Cross-tenant access is blocked by the backend.",
    inputSchema: withIdentity({
      decId: z
        .string()
        .trim()
        .min(1)
        .describe(
          "Declaration tracking ID returned by customs_submit_ai_maker — required",
        ),
    }),
    async handler(input: ToolInput, ctx: ExecutionContext) {
      const identity = resolveIdentity(
        input._identity as IdentityOverride,
        ctx.config.identity,
      );
      return queryAiMakerStatus(ctx, identity, {
        decId: input.decId as string,
      });
    },
  };
}
