/**
 * Ship-related business API (2 capabilities).
 *
 *   - ship_info  — single bill-of-lading ship info / container tracking
 *                  Performs CLIENT-SIDE I→E fallback when `ieFlag` is omitted
 *                  (the backend does NOT auto-fallback for this endpoint,
 *                  and may return a misleading `baseInfo`-only response that
 *                  is not actually a "hit" — see `hasRealShipInfo` below)
 *
 *   - ship_plan  — container ship plan associated with a transport vessel
 *                  Strictly requires I/E + shipName + voyage
 *
 * @author ZHANGCHAO
 */

import { UpstreamError } from "../errors/types.js";
import type { JeecgResult } from "../http/client.js";
import type { ResolvedIdentity } from "../identity.js";
import type { ExecutionContext } from "../tools/_common.js";

// ─────────────────────────────────────────────────────────────────
// ship-info  (with client-side I→E fallback)
// ─────────────────────────────────────────────────────────────────

const ACTION_SHIP_INFO = "agent:declaration:shipInfo";

export interface ShipInfoParams {
  /** When omitted, we try I first, then E if there is no real hit. */
  ieFlag?: "I" | "E";
  /** Required bill of lading; backend field name is `billCode` (legacy). */
  billNo: string;
  /** Optional vessel name; backend uses it to backfill baseInfo when miss. */
  shipName?: string;
  /** Optional voyage number; same role as `shipName`. */
  voyage?: string;
}

export async function queryShipInfo(
  ctx: ExecutionContext,
  identity: ResolvedIdentity,
  params: ShipInfoParams,
): Promise<JeecgResult> {
  // Explicit I/E → single call
  if (params.ieFlag) {
    return callShipInfo(ctx, identity, params.ieFlag, params);
  }

  // Auto-fallback: try I first, then E if I returned no real hit
  try {
    const respI = await callShipInfo(ctx, identity, "I", params);
    if (hasRealShipInfo(respI, params.shipName, params.voyage)) {
      return respI;
    }
    // I returned only a stub baseInfo (no real data) → try E
    return callShipInfo(ctx, identity, "E", params);
  } catch (error) {
    // I path raised a business / network error → fall through to E
    if (error instanceof UpstreamError) {
      return callShipInfo(ctx, identity, "E", params);
    }
    throw error;
  }
}

async function callShipInfo(
  ctx: ExecutionContext,
  identity: ResolvedIdentity,
  ieFlag: "I" | "E",
  params: ShipInfoParams,
): Promise<JeecgResult> {
  const grant = await ctx.grant.grantFor(identity, ACTION_SHIP_INFO);
  return ctx.http.get(
    "/v1/declaration/shipInfo",
    {
      ieFlag,
      billCode: params.billNo, // backend legacy name
      shipName: params.shipName,
      voyage: params.voyage,
    },
    { grant },
  );
}

/**
 * Decide whether a `/v1/declaration/shipInfo` response has *real* business data
 * (a hit) versus a stub `baseInfo`-only fallback (a miss).
 *
 * The backend returns `success: true` even on miss, with just a baseInfo
 * scaffold echoing the query parameters. We use these heuristics, kept in
 * lockstep with the customs-skill Python implementation:
 *
 *   1. `success !== true` → miss
 *   2. `result` empty / non-object → miss
 *   3. ANY field other than `baseInfo` is a non-empty list/object → hit
 *   4. With only `baseInfo`:
 *      - `zxl` / `sxkssj` / `sxjssj` non-empty → hit
 *      - `zwcm` non-empty AND != queryShipName → hit
 *      - `ywcm` non-empty AND (queryShipName empty OR != queryShipName) → hit
 *      - `voyage` non-empty AND (queryVoyage empty OR != queryVoyage) → hit
 *   5. Otherwise → miss
 */
export function hasRealShipInfo(
  resp: JeecgResult,
  queryShipName: string | undefined,
  queryVoyage: string | undefined,
): boolean {
  if (resp.success !== true) return false;
  const result = resp.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) return false;

  const record = result as Record<string, unknown>;
  if (Object.keys(record).length === 0) return false;

  // Rule 3: any non-baseInfo, non-empty list/object field is a hit
  for (const [key, value] of Object.entries(record)) {
    if (key === "baseInfo") continue;
    if (isNonEmptyContainer(value)) return true;
  }

  // Rule 4: only baseInfo is present — interrogate its key fields
  const base = record.baseInfo;
  if (!base || typeof base !== "object" || Array.isArray(base)) return false;
  const baseRecord = base as Record<string, unknown>;

  if (
    isPresent(baseRecord.zxl) ||
    isPresent(baseRecord.sxkssj) ||
    isPresent(baseRecord.sxjssj)
  ) {
    return true;
  }

  const qShip = (queryShipName ?? "").trim();
  const qVoy = (queryVoyage ?? "").trim();
  const zwcm = stringify(baseRecord.zwcm);
  const ywcm = stringify(baseRecord.ywcm);
  const voyage = stringify(baseRecord.voyage);

  if (zwcm && zwcm !== qShip) return true;
  if (ywcm && (!qShip || ywcm !== qShip)) return true;
  if (voyage && (!qVoy || voyage !== qVoy)) return true;

  return false;
}

function isNonEmptyContainer(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return false;
}

function isPresent(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function stringify(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

// ─────────────────────────────────────────────────────────────────
// ship-plan
// ─────────────────────────────────────────────────────────────────

const ACTION_SHIP_PLAN = "agent:declaration:shipPlan";

export interface ShipPlanParams {
  ieFlag: "I" | "E";
  shipName: string;
  voyage: string;
}

export async function queryShipPlan(
  ctx: ExecutionContext,
  identity: ResolvedIdentity,
  params: ShipPlanParams,
): Promise<JeecgResult> {
  const grant = await ctx.grant.grantFor(identity, ACTION_SHIP_PLAN);
  return ctx.http.get(
    "/v1/declaration/shipPlan",
    {
      ieFlag: params.ieFlag,
      shipName: params.shipName,
      voyage: params.voyage,
    },
    { grant },
  );
}
