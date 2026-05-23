/**
 * Order draft pre-check.
 *
 * Note: this endpoint is currently in PRECHECK-ONLY mode on the backend —
 * it validates payload + writes an audit row, but does NOT actually persist
 * a new order. Production order creation is gated behind a future
 * `confirmCreate` endpoint.
 *
 * The MCP tool surfaces this state in its description so AI agents can
 * communicate it to end users.
 *
 * @author ZHANGCHAO
 */

import type { JeecgResult } from "../http/client.js";
import type { ResolvedIdentity } from "../identity.js";
import type { ExecutionContext } from "../tools/_common.js";

const ACTION_ORDER_CREATE_DRAFT = "agent:order:createDraft";

/** Single product / goods line in the draft. */
export interface GoodsLine {
  /** Product name (required either pn or hsname). */
  pn?: string;
  /** HS-classified description name (required either pn or hsname). */
  hsname?: string;
  qty: number;
  qunit?: string;
  price?: number;
  amount?: number;
  currency?: string;
  [key: string]: unknown;
}

export interface OrderCreateDraftParams {
  orderType: string; // e.g. "PROCURE"
  ieFlag: "I" | "E";
  buyerName: string;
  currency?: string;
  totalAmount?: number;
  contractNo?: string;
  remark?: string;
  goodsLines: GoodsLine[];
}

export async function createOrderDraft(
  ctx: ExecutionContext,
  identity: ResolvedIdentity,
  params: OrderCreateDraftParams,
): Promise<JeecgResult> {
  const grant = await ctx.grant.grantFor(identity, ACTION_ORDER_CREATE_DRAFT);
  return ctx.http.postJson(
    "/action/v1/order/createDraft",
    {
      orderType: params.orderType,
      ieFlag: params.ieFlag,
      buyerName: params.buyerName,
      currency: params.currency ?? null,
      totalAmount: params.totalAmount ?? null,
      contractNo: params.contractNo ?? null,
      remark: params.remark ?? null,
      goodsLines: params.goodsLines,
    },
    { grant },
  );
}
