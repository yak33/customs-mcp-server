/**
 * GrantBroker tests: tri-state decision + caching + concurrent de-dup.
 *
 * Uses a manual stub `HttpClient` injected via `as never`. We don't reach
 * into `vi.mock` because `HttpClient`'s only behavior we care about is
 * `postJson`, which is easy to mock as an inline object.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { GrantBroker } from "../../src/auth/grantBroker.js";
import {
  NeedBindError,
  NeedTenantError,
  UpstreamError,
} from "../../src/errors/types.js";
import type { HttpClient, JeecgResult } from "../../src/http/client.js";
import type { ResolvedIdentity } from "../../src/identity.js";

interface RecordedCall {
  path: string;
  body: Record<string, unknown>;
}

class StubHttp {
  public calls: RecordedCall[] = [];
  public responses: JeecgResult[] = [];

  public async postJson(
    path: string,
    body: Record<string, unknown>,
  ): Promise<JeecgResult> {
    this.calls.push({ path, body });
    const next = this.responses.shift();
    if (!next) throw new Error(`StubHttp: no more responses queued for ${path}`);
    return next;
  }

  // Methods the broker doesn't use — present only to satisfy the interface.
  public get(): Promise<JeecgResult> {
    throw new Error("not used");
  }
  public postMultipart(): Promise<JeecgResult> {
    throw new Error("not used");
  }
}

function makeReadyResponse(
  agentToken = "tok-abc",
  tenantId = "42",
): JeecgResult {
  return {
    success: true,
    result: { decision: "READY", agentToken, tenantId },
  };
}

const IDENTITY: ResolvedIdentity = Object.freeze({
  platform: "mcp",
  externalUserId: "zhangchao",
  externalCorpId: "mcp-prod",
  channel: "mcp",
});

describe("GrantBroker tri-state decision", () => {
  let http: StubHttp;
  let broker: GrantBroker;

  beforeEach(() => {
    http = new StubHttp();
    broker = new GrantBroker(http as unknown as HttpClient, "mcp-prod");
  });

  it("READY returns ready-to-attach grant headers", async () => {
    http.responses.push(makeReadyResponse("tok-1", "10"));
    const grant = await broker.grantFor(IDENTITY, "agent:declaration:status");
    expect(grant["X-Access-Token"]).toBe("tok-1");
    expect(grant["Tenant-Id"]).toBe("10");
    expect(grant["X-Agent-Action-Code"]).toBe("agent:declaration:status");
  });

  it("NEED_BIND raises NeedBindError with identity context", async () => {
    http.responses.push({
      success: true,
      result: { decision: "NEED_BIND" },
    });
    await expect(
      broker.grantFor(IDENTITY, "agent:declaration:status"),
    ).rejects.toBeInstanceOf(NeedBindError);
  });

  it("NEED_TENANT raises NeedTenantError", async () => {
    http.responses.push({
      success: true,
      result: { decision: "NEED_TENANT", reason: "multi-tenant" },
    });
    await expect(broker.grantFor(IDENTITY, "agent:any")).rejects.toBeInstanceOf(
      NeedTenantError,
    );
  });

  it("unknown decision raises UpstreamError", async () => {
    http.responses.push({
      success: true,
      result: { decision: "WHATEVER" },
    });
    await expect(broker.grantFor(IDENTITY, "agent:any")).rejects.toBeInstanceOf(
      UpstreamError,
    );
  });
});

describe("GrantBroker caching", () => {
  let http: StubHttp;
  let broker: GrantBroker;

  beforeEach(() => {
    http = new StubHttp();
    broker = new GrantBroker(http as unknown as HttpClient, "mcp-prod");
  });

  it("second call for same (identity, action) hits cache, does not exchange", async () => {
    http.responses.push(makeReadyResponse("tok-cached", "99"));
    // only ONE stub queued — a second exchange would throw

    const g1 = await broker.grantFor(IDENTITY, "agent:declaration:status");
    const g2 = await broker.grantFor(IDENTITY, "agent:declaration:status");

    expect(g1["X-Access-Token"]).toBe("tok-cached");
    expect(g2["X-Access-Token"]).toBe("tok-cached");
    expect(http.calls).toHaveLength(1);
  });

  it("different actions cache separately", async () => {
    http.responses.push(makeReadyResponse("tok-status", "1"));
    http.responses.push(makeReadyResponse("tok-detail", "1"));

    const g1 = await broker.grantFor(IDENTITY, "agent:declaration:status");
    const g2 = await broker.grantFor(IDENTITY, "agent:declaration:detail");

    expect(g1["X-Access-Token"]).toBe("tok-status");
    expect(g2["X-Access-Token"]).toBe("tok-detail");
    expect(http.calls).toHaveLength(2);
  });

  it("invalidate(identity, action) re-exchanges", async () => {
    http.responses.push(makeReadyResponse("tok-old", "1"));
    http.responses.push(makeReadyResponse("tok-new", "1"));

    await broker.grantFor(IDENTITY, "agent:any");
    broker.invalidate(IDENTITY, "agent:any");
    const g2 = await broker.grantFor(IDENTITY, "agent:any");

    expect(g2["X-Access-Token"]).toBe("tok-new");
    expect(http.calls).toHaveLength(2);
  });

  it("invalidate() with no args clears everything", async () => {
    http.responses.push(makeReadyResponse("a1"));
    http.responses.push(makeReadyResponse("b1"));
    http.responses.push(makeReadyResponse("a2"));
    http.responses.push(makeReadyResponse("b2"));

    await broker.grantFor(IDENTITY, "agent:a");
    await broker.grantFor(IDENTITY, "agent:b");
    broker.invalidate();
    await broker.grantFor(IDENTITY, "agent:a");
    await broker.grantFor(IDENTITY, "agent:b");

    expect(http.calls).toHaveLength(4);
  });
});

describe("GrantBroker concurrent exchange de-duplication", () => {
  it("two concurrent grantFor() for same key share a single exchange", async () => {
    const http = new StubHttp();
    // Queue exactly one response — if dedup fails, the second call throws
    http.responses.push(makeReadyResponse("tok-shared", "1"));

    const broker = new GrantBroker(http as unknown as HttpClient, "mcp-prod");
    const [g1, g2] = await Promise.all([
      broker.grantFor(IDENTITY, "agent:race"),
      broker.grantFor(IDENTITY, "agent:race"),
    ]);

    expect(g1["X-Access-Token"]).toBe("tok-shared");
    expect(g2["X-Access-Token"]).toBe("tok-shared");
    expect(http.calls).toHaveLength(1);
  });
});

describe("GrantBroker exchange request body", () => {
  it("sends all required fields with backend-expected names", async () => {
    const http = new StubHttp();
    http.responses.push(makeReadyResponse());
    const broker = new GrantBroker(http as unknown as HttpClient, "mcp-prod");

    await broker.grantFor(IDENTITY, "agent:ai:maker");

    const body = http.calls[0]!.body;
    expect(body.platform).toBe("mcp");
    expect(body.senderId).toBe("zhangchao");
    expect(body.appId).toBe("mcp-prod");
    expect(body.actionCode).toBe("agent:ai:maker");
    expect(body.channel).toBe("mcp");
    expect(body.chatId).toBeNull();
    expect(body.messageId).toBeNull();
  });
});
