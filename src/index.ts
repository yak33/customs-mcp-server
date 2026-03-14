#!/usr/bin/env node
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig, type AppConfig, type TransportMode } from "./config.js";
import { createCustomsMcpServer } from "./server.js";

type ClosableServer = {
  close?: () => Promise<void> | void;
};

interface HttpSession {
  transport: StreamableHTTPServerTransport;
  server: ClosableServer;
}

function getTransportMode(): TransportMode {
  const transportArgIndex = process.argv.indexOf("--transport");
  const transportValue = transportArgIndex >= 0 ? process.argv[transportArgIndex + 1] : undefined;
  return transportValue === "http" ? "http" : "stdio";
}

function log(message: string, meta?: unknown): void {
  if (meta === undefined) {
    console.error(`[customs-mcp-server] ${message}`);
    return;
  }
  console.error(`[customs-mcp-server] ${message}`, meta);
}

function isInitializeRequest(body: unknown): boolean {
  return typeof body === "object"
    && body !== null
    && "method" in body
    && (body as { method?: string }).method === "initialize";
}

async function safeClose(server: ClosableServer): Promise<void> {
  await Promise.resolve(server.close?.());
}

async function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return undefined;
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function writeJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function startStdioServer(config: AppConfig): Promise<void> {
  const server = createCustomsMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("MCP stdio transport is ready");
}

async function startHttpServer(config: AppConfig): Promise<void> {
  const sessions = new Map<string, HttpSession>();
  const httpServer = createHttpServer(async (req, res) => {
    try {
      if (!req.url) {
        writeJson(res, 400, { error: "Missing request URL" });
        return;
      }

      const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
      if (url.pathname === "/health") {
        writeJson(res, 200, { status: "ok" });
        return;
      }
      if (url.pathname !== config.httpPath) {
        writeJson(res, 404, { error: "Not Found" });
        return;
      }

      const method = req.method || "GET";
      const sessionIdHeader = req.headers["mcp-session-id"];
      const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;

      if (method === "POST") {
        const parsedBody = await parseJsonBody(req);
        let session = sessionId ? sessions.get(sessionId) : undefined;

        if (!session) {
          if (!isInitializeRequest(parsedBody)) {
            writeJson(res, 400, { error: "Missing or invalid MCP session. Send initialize first." });
            return;
          }

          const server = createCustomsMcpServer(config);
          let createdSessionId = "";
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            enableJsonResponse: config.httpJsonResponse,
            onsessioninitialized: (newSessionId) => {
              createdSessionId = newSessionId;
              sessions.set(newSessionId, { transport, server: server as ClosableServer });
            }
          });

          transport.onclose = async () => {
            if (createdSessionId) {
              sessions.delete(createdSessionId);
            }
            await safeClose(server as ClosableServer);
          };

          await server.connect(transport);
          await transport.handleRequest(req, res, parsedBody);
          return;
        }

        await session.transport.handleRequest(req, res, parsedBody);
        return;
      }

      if (method === "GET" || method === "DELETE") {
        if (!sessionId) {
          writeJson(res, 400, { error: "Missing mcp-session-id header" });
          return;
        }
        const session = sessions.get(sessionId);
        if (!session) {
          writeJson(res, 404, { error: "Unknown MCP session" });
          return;
        }
        await session.transport.handleRequest(req, res);
        if (method === "DELETE") {
          sessions.delete(sessionId);
          await safeClose(session.server);
        }
        return;
      }

      writeJson(res, 405, { error: `Unsupported method: ${method}` });
    } catch (error) {
      log("HTTP transport request failed", error);
      if (!res.headersSent) {
        writeJson(res, 500, {
          error: error instanceof Error ? error.message : "Internal Server Error"
        });
      } else {
        res.end();
      }
    }
  });

  httpServer.listen(config.httpPort, config.httpHost, () => {
    log(`MCP HTTP transport is listening on http://${config.httpHost}:${config.httpPort}${config.httpPath}`);
  });

  const shutdown = async () => {
    log("Shutting down HTTP transport");
    for (const [sessionId, session] of sessions) {
      sessions.delete(sessionId);
      await Promise.resolve(session.transport.close());
      await safeClose(session.server);
    }
    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
}

async function main(): Promise<void> {
  const config = loadConfig();
  const transportMode = getTransportMode();
  if (transportMode === "http") {
    await startHttpServer(config);
    return;
  }
  await startStdioServer(config);
}

main().catch((error) => {
  log("Startup failed", error);
  process.exit(1);
});
