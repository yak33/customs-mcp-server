/**
 * Manifest queries with optional local-state sync side effects.
 *
 *   - manifest_info        — generic manifest arrival query (sea + air via
 *                             transportType=2/5). The optional declaration
 *                             identifiers (decId / entryId / customsNo /
 *                             seqNo / cusCiqNo) trigger a backend-side
 *                             update of local DecHead.hasCd / hasYd when
 *                             a single matching declaration is found.
 *
 *   - ship_manifest_info   — sea-specific manifest box query. Optional
 *                             declaration identifiers trigger DecHead.hasCd
 *                             sync. ieFlag / shipName / voyage / billNo
 *                             are all required.
 *
 * The MCP server is a thin pass-through: it does NOT enforce or alter the
 * local-state side effect — that contract lives entirely on the backend.
 *
 * @author ZHANGCHAO
 */

import type { JeecgResult } from "../http/client.js";
import type { ResolvedIdentity } from "../identity.js";
import type { ExecutionContext } from "../tools/_common.js";

// ─────────────────────────────────────────────────────────────────
// manifest-info
// ─────────────────────────────────────────────────────────────────

const ACTION_MANIFEST_INFO = "agent:declaration:manifestInfo";

export interface ManifestInfoParams {
  // Required: third-party API parameters
  portCode: string;
  /** "2" = sea, "5" = air */
  transportType: "2" | "5";

  // Optional: either masterBillNo or billNo (or both) required
  masterBillNo?: string;
  billNo?: string;

  // Optional declaration identifiers (trigger local DecHead.hasCd/hasYd sync)
  decId?: string;
  entryId?: string;
  customsNo?: string;
  seqNo?: string;
  cusCiqNo?: string;
}

export async function queryManifestInfo(
  ctx: ExecutionContext,
  identity: ResolvedIdentity,
  params: ManifestInfoParams,
): Promise<JeecgResult> {
  const grant = await ctx.grant.grantFor(identity, ACTION_MANIFEST_INFO);
  return ctx.http.get(
    "/v1/declaration/manifestInfo",
    {
      decId: params.decId,
      entryId: params.entryId,
      customsNo: params.customsNo,
      seqNo: params.seqNo,
      cusCiqNo: params.cusCiqNo,
      portCode: params.portCode,
      transportType: params.transportType,
      mwb: params.masterBillNo, // backend legacy name
      billNo: params.billNo,
    },
    { grant },
  );
}

// ─────────────────────────────────────────────────────────────────
// ship-manifest-info  (sea-specific)
// ─────────────────────────────────────────────────────────────────

const ACTION_SHIP_MANIFEST_INFO = "agent:declaration:shipManifestInfo";

export interface ShipManifestInfoParams {
  ieFlag: "I" | "E";
  shipName: string; // 船名 or 船舶 ID
  voyage: string;
  billNo: string;

  // Optional declaration identifiers (trigger DecHead.hasCd sync)
  decId?: string;
  entryId?: string;
  customsNo?: string;
  seqNo?: string;
  cusCiqNo?: string;
}

export async function queryShipManifestInfo(
  ctx: ExecutionContext,
  identity: ResolvedIdentity,
  params: ShipManifestInfoParams,
): Promise<JeecgResult> {
  const grant = await ctx.grant.grantFor(identity, ACTION_SHIP_MANIFEST_INFO);
  return ctx.http.get(
    "/v1/declaration/shipManifestInfo",
    {
      decId: params.decId,
      entryId: params.entryId,
      customsNo: params.customsNo,
      seqNo: params.seqNo,
      cusCiqNo: params.cusCiqNo,
      ieFlag: params.ieFlag,
      shipName: params.shipName,
      voyage: params.voyage,
      billNo: params.billNo,
    },
    { grant },
  );
}
