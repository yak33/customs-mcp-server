/**
 * Dual-use item screening (slow AI-backed query).
 *
 * The backend forwards this to a downstream AI provider, so latency can
 * reach several minutes. We pass a dedicated `customsDualUseTimeoutMs`
 * (default 660 s = 11 min) instead of the regular 15 s read timeout.
 *
 * @author ZHANGCHAO
 */

import type { JeecgResult } from "../http/client.js";
import type { ResolvedIdentity } from "../identity.js";
import type { ExecutionContext } from "../tools/_common.js";

const ACTION_DUAL_USE_QUERY = "agent:dualUseItems:query";

export interface DualUseQueryParams {
  productName: string;
  queryText: string;
}

export async function queryDualUseItem(
  ctx: ExecutionContext,
  identity: ResolvedIdentity,
  params: DualUseQueryParams,
): Promise<JeecgResult> {
  const grant = await ctx.grant.grantFor(identity, ACTION_DUAL_USE_QUERY);
  return ctx.http.postJson(
    "/v1/dualUseItems/query",
    {
      query_product_name: params.productName, // backend snake_case
      query_text: params.queryText,
    },
    {
      grant,
      timeout: ctx.config.customsDualUseTimeoutMs, // 660 s by default
    },
  );
}
