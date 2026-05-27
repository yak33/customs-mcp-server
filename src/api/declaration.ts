/**
 * Declaration-related business API calls.
 *
 * Wraps the customs backend `/v1/declaration/*` and `/v1/tracking/*`
 * endpoints, attaching the right action codes and grant headers via the
 * shared `GrantBroker`.
 *
 * One function per capability — function name mirrors the MCP tool name
 * (without the `customs_` prefix) for easy cross-reference.
 *
 * @author ZHANGCHAO
 */

import type { JeecgResult } from "../http/client.js";
import type { ResolvedIdentity } from "../identity.js";
import type { ExecutionContext } from "../tools/_common.js";

// ─────────────────────────────────────────────────────────────────
// declaration-status
// ─────────────────────────────────────────────────────────────────

/** Action code for declaration status query. */
const ACTION_DECLARATION_STATUS = "agent:declaration:status";

export interface DeclarationStatusParams {
  entryId?: string;
  seqNo?: string;
}

export async function queryDeclarationStatus(
  ctx: ExecutionContext,
  identity: ResolvedIdentity,
  params: DeclarationStatusParams,
): Promise<JeecgResult> {
  const grant = await ctx.grant.grantFor(identity, ACTION_DECLARATION_STATUS);
  return ctx.http.get(
    "/v1/declaration/status",
    {
      entryId: params.entryId,
      seqNo: params.seqNo,
    },
    { grant },
  );
}

// ─────────────────────────────────────────────────────────────────
// declaration-list
// ─────────────────────────────────────────────────────────────────

const ACTION_DECLARATION_LIST = "agent:declaration:list";

export interface DeclarationListParams {
  /** Status semantic group: unsubmitted/declared/released/closed/returned/... */
  statusGroup?: string;
  /** Exact status code: 1/2/4/6/7/8/9/10/11/S/T/U; takes precedence over statusGroup */
  decStatus?: string;
  ieFlag?: "I" | "E";
  /** Fuzzy match on seqNo/clearanceNo/customsNo/billCode */
  keyword?: string;
  /** Declaration date start, yyyy-MM-dd */
  startDate?: string;
  /** Declaration date end, yyyy-MM-dd */
  endDate?: string;
  /** Page number, starts from 1, default 1 */
  pageNo?: number;
  /** Page size, default 20, max 100 */
  pageSize?: number;
}

export async function queryDeclarationList(
  ctx: ExecutionContext,
  identity: ResolvedIdentity,
  params: DeclarationListParams,
): Promise<JeecgResult> {
  const grant = await ctx.grant.grantFor(identity, ACTION_DECLARATION_LIST);
  return ctx.http.get(
    "/v1/declaration/list",
    {
      statusGroup: params.statusGroup,
      decStatus: params.decStatus,
      ieFlag: params.ieFlag,
      keyword: params.keyword,
      startDate: params.startDate,
      endDate: params.endDate,
      pageNo: params.pageNo,
      pageSize: params.pageSize,
    },
    { grant },
  );
}

// ─────────────────────────────────────────────────────────────────
// declaration-detail
// ─────────────────────────────────────────────────────────────────

const ACTION_DECLARATION_DETAIL = "agent:declaration:detail";

/**
 * v1.0.0 upgrades the detail query to accept multiple lookup keys:
 * `decId` (preferred, returned by ai-maker) / `entryId` / `customsNo` / `seqNo`.
 *
 * The backend looks up `local DB` first via dec-id/entry/customs-no; falls
 * back to third-party API only when `seqNo` is provided.
 */
export interface DeclarationDetailParams {
  /** Internal local primary key, preferred when known (e.g. from ai-maker). */
  decId?: string;
  entryId?: string;
  customsNo?: string;
  seqNo?: string;
}

export async function queryDeclarationDetail(
  ctx: ExecutionContext,
  identity: ResolvedIdentity,
  params: DeclarationDetailParams,
): Promise<JeecgResult> {
  const grant = await ctx.grant.grantFor(identity, ACTION_DECLARATION_DETAIL);
  return ctx.http.get(
    "/v1/declaration/detail",
    {
      decId: params.decId,
      entryId: params.entryId,
      customsNo: params.customsNo,
      seqNo: params.seqNo,
    },
    { grant },
  );
}

// ─────────────────────────────────────────────────────────────────
// declaration ieStatus
// ─────────────────────────────────────────────────────────────────

const ACTION_IE_STATUS = "agent:declaration:ieStatus";

export interface ImportExportStatusParams {
  ieFlag?: "I" | "E";
  entryId?: string;
  billNo?: string;
}

/**
 * When `ieFlag` is omitted, the backend automatically tries I first, then E.
 * The MCP layer just passes through.
 */
export async function queryImportExportStatus(
  ctx: ExecutionContext,
  identity: ResolvedIdentity,
  params: ImportExportStatusParams,
): Promise<JeecgResult> {
  const grant = await ctx.grant.grantFor(identity, ACTION_IE_STATUS);
  return ctx.http.get(
    "/v1/declaration/ieStatus",
    {
      ieFlag: params.ieFlag,
      entryId: params.entryId,
      billNo: params.billNo,
    },
    { grant },
  );
}

// ─────────────────────────────────────────────────────────────────
// full-process tracking
// ─────────────────────────────────────────────────────────────────

const ACTION_FULL_PROCESS = "agent:tracking:fullProcess";

export interface FullProcessTrackingParams {
  ieFlag?: "I" | "E";
  billNo?: string;
  customsNo?: string;
}

/**
 * Same as `ieStatus`: backend handles I→E auto-fallback when `ieFlag` empty.
 */
export async function queryFullProcessTracking(
  ctx: ExecutionContext,
  identity: ResolvedIdentity,
  params: FullProcessTrackingParams,
): Promise<JeecgResult> {
  const grant = await ctx.grant.grantFor(identity, ACTION_FULL_PROCESS);
  return ctx.http.get(
    "/v1/tracking/fullProcess",
    {
      ieFlag: params.ieFlag,
      billNo: params.billNo,
      customsNo: params.customsNo,
    },
    { grant },
  );
}
