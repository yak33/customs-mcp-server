/**
 * Backend `/session/exchange` interaction.
 *
 * Flow:
 *   1. POST a JSON body that identifies the user (`platform` / `senderId` /
 *      `appId` / `actionCode`) + signed headers
 *   2. Inspect `result.decision`:
 *        - `READY`         → return {@link AgentTicket}
 *        - `NEED_BIND`     → throw {@link NeedBindError}
 *        - `NEED_TENANT`   → throw {@link NeedTenantError}
 *        - anything else   → throw {@link UpstreamError}
 *
 * This is the single sensitive boundary where the MCP server proves the
 * identity to the backend; everything downstream just attaches the
 * resulting `agentToken` / `tenantId` to subsequent requests.
 *
 * @author ZHANGCHAO
 */

import {
  NeedBindError,
  NeedTenantError,
  UpstreamError,
  type ErrorContext,
} from "../errors/types.js";
import type { HttpClient } from "../http/client.js";
import type { ResolvedIdentity } from "../identity.js";

/** Result of a successful `READY` exchange. */
export interface AgentTicket {
  readonly agentToken: string;
  readonly tenantId: string;
}

interface ExchangeResultPayload {
  decision?: string;
  agentToken?: string;
  tenantId?: string | number;
  reason?: string;
  sysUserId?: string | number;
}

/**
 * Exchange an identity + action code for a short-lived `agentToken`.
 *
 * @param http        HTTP client (uses signed POST, no grant headers needed
 *                    because exchange is what BUILDS the grant)
 * @param identity    Resolved identity (env defaults + per-call override)
 * @param actionCode  Backend action code, e.g. `agent:declaration:status`
 * @param appId       OpenClaw / MCP app identifier (e.g. "mcp-prod")
 */
export async function exchangeAgentTicket(
  http: HttpClient,
  identity: ResolvedIdentity,
  actionCode: string,
  appId: string,
): Promise<AgentTicket> {
  const body = {
    platform: identity.platform,
    channel: identity.channel,
    appId,
    senderId: identity.externalUserId,
    accountId: null,
    chatId: null,
    chatType: "direct",
    conversationId: null,
    messageId: null,
    actionCode,
    timestamp: null,
  };

  const response = await http.postJson("/session/exchange", body);
  const result = (response.result ?? {}) as ExchangeResultPayload;
  const decision = (result.decision ?? "").toUpperCase();

  const errorContext: ErrorContext = {
    platform: identity.platform,
    externalUserId: identity.externalUserId,
    externalCorpId: identity.externalCorpId,
    actionCode,
    sysUserId: result.sysUserId,
  };

  switch (decision) {
    case "READY": {
      if (!result.agentToken) {
        throw new UpstreamError(
          "Backend returned decision=READY but no agentToken",
          { ...errorContext, upstream: response },
        );
      }
      return Object.freeze({
        agentToken: String(result.agentToken),
        tenantId: String(result.tenantId ?? ""),
      });
    }
    case "NEED_BIND":
      throw new NeedBindError(errorContext);
    case "NEED_TENANT":
      throw new NeedTenantError({ ...errorContext, ...(result.reason && { reason: result.reason }) });
    default:
      throw new UpstreamError(
        `Unexpected decision from /session/exchange: ${decision || "(empty)"}`,
        { ...errorContext, upstream: response },
      );
  }
}
