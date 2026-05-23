/**
 * In-memory cache for backend `agentToken`s, scoped by (identity, actionCode).
 *
 * Why cache:
 *   - Backend `agentToken` is valid for 5 minutes
 *   - A single tool call may exchange + use → caching prevents repeat exchanges
 *   - The HTTP transport mode of MCP server may serve many tool calls per
 *     session; caching multiplies throughput and reduces backend load
 *
 * Eviction strategy: time-based with a 20-second buffer below the backend's
 * actual TTL (5 min). Optionally, callers can `invalidate()` on 401 responses
 * to force a re-exchange (e.g. when the backend rotates secrets).
 *
 * Concurrency: Node's single-threaded event loop avoids true races, but two
 * concurrent `grantFor()` calls for the same key may both miss the cache and
 * exchange twice. We dedupe via an in-flight `Map<string, Promise<...>>`.
 *
 * @author ZHANGCHAO
 */

import type { HttpClient } from "../http/client.js";
import { identityCacheKey, type ResolvedIdentity } from "../identity.js";
import { exchangeAgentTicket, type AgentTicket } from "./sessionExchange.js";
import { type GrantHeaders } from "./signer.js";

/** Cache entry with the source ticket plus an absolute expiry instant. */
interface CachedEntry {
  readonly ticket: AgentTicket;
  /** `Date.now()` value past which the entry is considered stale. */
  readonly expiresAtMs: number;
}

/** Time the broker considers a ticket fresh (backend TTL - safety buffer). */
const TICKET_TTL_MS = (5 * 60 - 20) * 1_000;

/** Composite cache key: `${identityKey}::${actionCode}`. */
function cacheKey(identity: ResolvedIdentity, actionCode: string): string {
  return `${identityCacheKey(identity)}::${actionCode}`;
}

export class GrantBroker {
  readonly #http: HttpClient;
  readonly #appId: string;
  readonly #cache = new Map<string, CachedEntry>();
  readonly #inFlight = new Map<string, Promise<AgentTicket>>();

  public constructor(http: HttpClient, appId: string) {
    this.#http = http;
    this.#appId = appId;
  }

  /**
   * Return ready-to-attach grant headers for `(identity, actionCode)`.
   *
   * Reuses a fresh cached ticket when available; otherwise exchanges a new
   * one via `/session/exchange` and stores it.
   */
  public async grantFor(
    identity: ResolvedIdentity,
    actionCode: string,
  ): Promise<GrantHeaders> {
    const ticket = await this.#getTicket(identity, actionCode);
    return Object.freeze({
      "X-Access-Token": ticket.agentToken,
      "Tenant-Id": ticket.tenantId,
      "X-Agent-Action-Code": actionCode,
    });
  }

  /**
   * Invalidate cached tickets — useful when the backend signals 401 or you
   * want to force a re-exchange.
   *
   * @param identity   if omitted, clear ALL entries; else clear only entries
   *                   matching this identity
   * @param actionCode if omitted, clear all action codes for the identity;
   *                   else clear only `(identity, actionCode)`
   */
  public invalidate(identity?: ResolvedIdentity, actionCode?: string): void {
    if (!identity) {
      this.#cache.clear();
      return;
    }
    if (actionCode) {
      this.#cache.delete(cacheKey(identity, actionCode));
      return;
    }
    const prefix = `${identityCacheKey(identity)}::`;
    for (const key of this.#cache.keys()) {
      if (key.startsWith(prefix)) this.#cache.delete(key);
    }
  }

  // ─────────────────────────────────────────────────
  // Internal
  // ─────────────────────────────────────────────────

  async #getTicket(
    identity: ResolvedIdentity,
    actionCode: string,
  ): Promise<AgentTicket> {
    const key = cacheKey(identity, actionCode);
    const now = Date.now();
    const cached = this.#cache.get(key);
    if (cached && cached.expiresAtMs > now) {
      return cached.ticket;
    }

    // De-dupe concurrent exchanges for the same key
    const inflight = this.#inFlight.get(key);
    if (inflight) return inflight;

    const promise = (async () => {
      try {
        const ticket = await exchangeAgentTicket(this.#http, identity, actionCode, this.#appId);
        this.#cache.set(key, { ticket, expiresAtMs: Date.now() + TICKET_TTL_MS });
        return ticket;
      } finally {
        this.#inFlight.delete(key);
      }
    })();
    this.#inFlight.set(key, promise);
    return promise;
  }
}
