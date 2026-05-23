/**
 * Tariff lookup business API.
 *
 * @author ZHANGCHAO
 */

import type { JeecgResult } from "../http/client.js";
import type { ResolvedIdentity } from "../identity.js";
import type { ExecutionContext } from "../tools/_common.js";

const ACTION_TARIFF_QUERY = "agent:tariff:query";

export interface TariffQueryParams {
  hscode?: string;
  hsname?: string;
}

export async function queryTariff(
  ctx: ExecutionContext,
  identity: ResolvedIdentity,
  params: TariffQueryParams,
): Promise<JeecgResult> {
  const grant = await ctx.grant.grantFor(identity, ACTION_TARIFF_QUERY);
  return ctx.http.get(
    "/v1/tariff/query",
    {
      hscode: params.hscode,
      hsname: params.hsname,
    },
    { grant },
  );
}
