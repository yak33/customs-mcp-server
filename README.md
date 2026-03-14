# @zhangchao/customs-mcp-server

> MCP server for customs declaration, tariff query and shipment tracking.
>
> 将关务系统的报关单查询、税则查询、进出口流转追踪等能力封装为标准 MCP 工具，供 Claude Desktop、Cursor 等 AI 客户端直接调用。

[![npm version](https://img.shields.io/npm/v/@zhangchao/customs-mcp-server)](https://www.npmjs.com/package/@zhangchao/customs-mcp-server)
[![license](https://img.shields.io/npm/l/@zhangchao/customs-mcp-server)](./LICENSE)
[![node](https://img.shields.io/node/v/@zhangchao/customs-mcp-server)](https://nodejs.org)

---

## Features / 功能

- **Declaration Status** — Query declaration status by entry ID or sequence number / 按报关单号或统一编号查询申报状态
- **Declaration List** — Search declarations by import/export flag, bill number, date range / 按进出口标志、提运单号、时间范围查询报关单列表
- **Declaration Detail** — Get full declaration details / 获取报关单全量详情
- **Import/Export Status** — Track import/export flow status / 查询进出口流转状态
- **Tariff Info** — Look up tariff by HS code or product name / 按 HS 编码或商品名称查询税则
- **Full Process Tracking** — End-to-end customs clearance tracking / 海关全流程流转轨迹追踪

---

## Quick Start / 快速开始

### Use with npx (no install needed)

Add the following to your MCP client configuration (e.g. `claude_desktop_config.json`):

将以下配置添加到 MCP 客户端配置文件中：

```json
{
  "mcpServers": {
    "customs": {
      "command": "npx",
      "args": ["-y", "@zhangchao/customs-mcp-server", "--transport", "stdio"],
      "env": {
        "CUSTOMS_API_BASE_URL": "http://your-backend-host:port",
        "CUSTOMS_API_PREFIX": "/open-api/agent",
        "CUSTOMS_ACCESS_KEY": "your-access-key",
        "CUSTOMS_SECRET_KEY": "your-secret-key"
      }
    }
  }
}
```

### Global install

```bash
npm install -g @zhangchao/customs-mcp-server
customs-mcp-server --transport stdio
```

---

## Environment Variables / 环境变量

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `CUSTOMS_API_BASE_URL` | **Yes** | — | Backend API root URL / 后端 API 根地址 |
| `CUSTOMS_API_PREFIX` | No | `/open-api/agent` | API path prefix / 接口路径前缀 |
| `CUSTOMS_ACCESS_KEY` | **Yes** | — | Access key for API auth / 接口鉴权 accessKey |
| `CUSTOMS_SECRET_KEY` | **Yes** | — | Secret key for signing / 签名密钥 secretKey |
| `CUSTOMS_SIGN_ALGORITHM` | No | `MD5` | Signature algorithm / 签名算法 |
| `CUSTOMS_TIMEOUT_MS` | No | `15000` | Request timeout in ms / 请求超时(毫秒) |
| `CUSTOMS_TIMESTAMP_TIMEZONE` | No | `Asia/Shanghai` | Timezone for timestamp / 时间戳时区 |
| `MCP_HTTP_HOST` | No | `0.0.0.0` | HTTP transport bind host |
| `MCP_HTTP_PORT` | No | `8787` | HTTP transport port |
| `MCP_HTTP_PATH` | No | `/mcp` | HTTP transport endpoint path |
| `MCP_HTTP_JSON_RESPONSE` | No | `false` | Return JSON instead of SSE |

---

## Available Tools / 可用工具

### `customs_get_declaration_status`

Query declaration status / 查询申报状态

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `entryId` | string | No* | Entry ID / 报关单号 |
| `seqNo` | string | No* | Sequence number / 统一编号 |

> \* At least one of `entryId` or `seqNo` is required / 至少提供一个

### `customs_query_declaration_list`

Search declaration list / 查询报关单列表

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `ieFlag` | `"I"` \| `"E"` | No | Import/Export flag / 进出口标志 |
| `entryId` | string | No* | Entry ID or sequence number / 报关单号或统一编号 |
| `billNo` | string | No* | Bill of lading number / 提运单号 |
| `beginTime` | string | No* | Start date (`yyyy-MM-dd`) / 开始日期 |
| `endTime` | string | No* | End date (`yyyy-MM-dd`) / 结束日期 |

> \* At least one of `entryId`, `billNo`, `beginTime`, `endTime` is required

### `customs_get_declaration_detail`

Get full declaration details / 获取报关单全量详情

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `cusCiqNo` | string | **Yes** | Entry ID or sequence number / 报关单号或统一编号 |

### `customs_get_import_export_status`

Query import/export flow status / 查询进出口流转状态

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `ieFlag` | `"I"` \| `"E"` | No | Import/Export flag (auto-fallback: I → E) / 进出口标志 |
| `entryId` | string | No* | Entry ID / 报关单号 |
| `billNo` | string | No* | Bill of lading number / 提运单号 |

> \* At least one of `entryId` or `billNo` is required

### `customs_query_tariff_info`

Look up tariff information / 查询税则信息

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `hscode` | string | No* | HS code / HS 编码 |
| `hsname` | string | No* | Product name / 商品名称 |

> \* At least one of `hscode` or `hsname` is required

### `customs_get_full_process_tracking`

End-to-end customs tracking / 海关全流程流转轨迹

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `ieFlag` | `"I"` \| `"E"` | No | Import/Export flag (auto-fallback: I → E) / 进出口标志 |
| `billNo` | string | No* | Bill of lading number / 提运单号 |
| `customsNo` | string | No* | Customs declaration number / 报关单号 |

> \* At least one of `billNo` or `customsNo` is required

---

## Transport Modes / 传输模式

### stdio (default)

Standard I/O transport — for local MCP clients like Claude Desktop.

```bash
customs-mcp-server --transport stdio
```

### HTTP (Streamable HTTP)

HTTP transport — for remote deployment scenarios.

```bash
customs-mcp-server --transport http
```

Endpoints:

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/mcp` | MCP message endpoint |
| `GET` | `/mcp` | SSE connection |
| `DELETE` | `/mcp` | Close session |
| `GET` | `/health` | Health check |

---

## Docker Deployment / Docker 部署

1. Create runtime config from the example / 基于示例创建运行时配置：

```bash
cp .env.compose.example .env.compose
# Edit .env.compose with your actual values
```

2. Start the container / 启动容器：

```bash
docker compose up -d --build
```

3. Verify / 验证：

```bash
curl http://127.0.0.1:8787/health
```

---

## Auth Protocol / 签名协议

Requests to the backend API are signed with the following headers:

| Header | Description |
| --- | --- |
| `accessKey` | Your access key |
| `timestamp` | Current timestamp (in configured timezone) |
| `nonce` | Random UUID per request |
| `sign` | `MD5(accessKey + timestamp + nonce + secretKey)` |

The algorithm must match your backend `service_lic` configuration.

签名算法需与后端 `service_lic` 中配置的算法保持一致。

---

## License

[MIT](./LICENSE) © ZHANGCHAO
