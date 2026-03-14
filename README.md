# customs-mcp-server

将你后端的 `/open-api/agent/**` 关务接口封装成标准 **MCP tools**，让 Claude Desktop、Warp、Cursor 等支持 MCP 的 AI 客户端可以直接查询报关单、税则、进出口流转状态等信息。

## 能力范围

- `customs_get_declaration_status`
- `customs_query_declaration_list`
- `customs_get_declaration_detail`
- `customs_get_import_export_status`
- `customs_query_tariff_info`
- `customs_get_full_process_tracking`

## 目录结构

```text
customs-mcp-server/
  src/
    config.ts
    customsApiClient.ts
    server.ts
    index.ts
  .env.example
  package.json
  tsconfig.json
```

## 前置条件

1. Spring 后端已经提供 `/open-api/agent/**` 接口。
2. `service_lic` 已经配置好一组 `accessKey / secretKey`。
3. `service_lic_url` 已经放行目标 Agent API URI。
4. 建议在 HTTPS 或加密私网环境下调用，不建议公网明文传输。

## 环境变量

参考 `.env.example`：

```env
CUSTOMS_API_BASE_URL=http://127.0.0.1:7002
CUSTOMS_API_PREFIX=/open-api/agent
CUSTOMS_ACCESS_KEY=replace-with-access-key
CUSTOMS_SECRET_KEY=replace-with-secret-key
CUSTOMS_SIGN_ALGORITHM=MD5
CUSTOMS_TIMEOUT_MS=15000
CUSTOMS_TIMESTAMP_TIMEZONE=Asia/Shanghai
MCP_HTTP_HOST=0.0.0.0
MCP_HTTP_PORT=8787
MCP_HTTP_PATH=/mcp
MCP_HTTP_JSON_RESPONSE=false
```

说明：

- `CUSTOMS_API_BASE_URL`
  如果你的真实访问地址包含上下文路径，比如 `http://host/jgsoft`，这里就要写完整根地址。
- `CUSTOMS_API_PREFIX`
  默认是 `/open-api/agent`。
- `CUSTOMS_SIGN_ALGORITHM`
  当前仅支持 `MD5`，需要与你后端 `service_lic` 中的算法配置保持一致。
- `CUSTOMS_TIMESTAMP_TIMEZONE`
  Java 后端会把 `timestamp` 当本地时间解析。跨服务器部署时，最好显式指定成和关务系统一致的时区。

本地联调时，如果你的关务系统已经启动在 `http://localhost:9999`，可以直接使用项目里的 `.env` 默认配置。

## 安装

```bash
pnpm install
```

## 本地开发

stdio transport：

```bash
pnpm dev:stdio
```

HTTP transport：

```bash
pnpm dev:http
```

## 构建

```bash
pnpm build
```

## Docker Compose 部署

如果你要在 Linux 服务器上长期运行，推荐用 Docker Compose。

1. 基于示例环境文件创建运行时配置：

```bash
cp .env.compose.example .env.compose
```

2. 按实际环境修改 `.env.compose`

- 如果关务系统跑在宿主机，`CUSTOMS_API_BASE_URL` 可以写成 `http://host.docker.internal:9999`
- 如果关务系统和 MCP 在同一个 Docker 网络里，改成对应服务名，例如 `http://trade-service-platform:9999`

3. 启动容器：

```bash
docker compose up -d --build
```

4. 查看状态：

```bash
docker compose ps
docker compose logs -f customs-mcp-server
```

默认会把 MCP 服务绑定到宿主机的：

```text
http://127.0.0.1:8787/mcp
```

健康检查地址：

```text
http://127.0.0.1:8787/health
```

## 运行

stdio transport：

```bash
pnpm start:stdio
```

HTTP transport：

```bash
pnpm start:http
```

默认健康检查：

```text
GET /health
```

默认 MCP 入口：

```text
POST /mcp
GET /mcp
DELETE /mcp
```

## 接入示例

### 作为本地 stdio MCP Server

```json
{
  "mcpServers": {
    "customs": {
      "command": "node",
      "args": [
        "D:/yorma-project-new/chanpin/TradeServicePlatform/Agent/customs-mcp-server/dist/index.js",
        "--transport",
        "stdio"
      ],
      "cwd": "D:/yorma-project-new/chanpin/TradeServicePlatform/Agent/customs-mcp-server",
      "env": {
        "CUSTOMS_API_BASE_URL": "http://127.0.0.1:7002",
        "CUSTOMS_API_PREFIX": "/open-api/agent",
        "CUSTOMS_ACCESS_KEY": "replace-with-access-key",
        "CUSTOMS_SECRET_KEY": "replace-with-secret-key",
        "CUSTOMS_SIGN_ALGORITHM": "MD5",
        "CUSTOMS_TIMESTAMP_TIMEZONE": "Asia/Shanghai"
      }
    }
  }
}
```

### 作为远程 HTTP MCP Server

如果你的客户端支持 Streamable HTTP MCP，可以把它部署为一个独立服务，然后通过：

```text
http://<host>:8787/mcp
```

进行接入。

如果你是通过 Docker Compose 部署，并且 OpenClaw 与 MCP 在同一台服务器上，优先让 OpenClaw 连接：

```text
http://127.0.0.1:8787/mcp
```

如果 OpenClaw 在另一台服务器上，建议通过私网、Tailscale 或 HTTPS 反向代理后再暴露给它。

## 签名协议说明

这个 MCP 服务调用的是受 `AgentAuthInterceptor` 保护的 Agent API。
它生成的请求头和签名原文遵循 `AgentAuthInterceptor` 当前复用的 `AuthKit` 规则：

- `accessKey`
- `timestamp`
- `nonce`
- `sign`

当前默认按 `MD5` 生成签名，和你 `service_lic` 里配置的 `ALGORITHM=MD5` 对齐。

## 联调结果

已在本地完成一轮最小闭环验证：

- `http://localhost:9999/open-api/agent/v1/declaration/status` 路由可达
- 使用 MCP 内部签名逻辑访问后端成功通过鉴权
- 通过 HTTP MCP transport 完成 `initialize`、`tools/list`、`tools/call`

如果你用测试参数 `entryId=TEST-ENTRY-ID` 调用 `customs_get_declaration_status`，当前后端会返回“未找到匹配的报关单记录”，这说明 MCP -> Agent API 的链路已经打通，只是该测试单号在本地库里不存在。

提示：

- Streamable HTTP MCP 客户端请求时，`Accept` 头需要同时包含 `application/json` 和 `text/event-stream`
- 生产环境仍建议放在 HTTPS 或加密私网后面

## 后续扩展建议

- 如果你要新增 Agent API，只需要：
  1. 在 `customsApiClient.ts` 增加一个方法
  2. 在 `server.ts` 注册一个新的 tool
- 如果你未来要做多租户隔离，可以在这里再加一层 client profile / credential routing
- 如果你要对响应做更强的结构化输出，可以继续为工具补 `outputSchema`
