import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { AppConfig } from "./config.js";
import { CustomsApiClient, type JeecgResult } from "./customsApiClient.js";

function normalizeTextResult(payload: JeecgResult): string {
  return JSON.stringify(payload, null, 2);
}

function toToolResult(payload: JeecgResult) {
  return {
    content: [
      {
        type: "text" as const,
        text: normalizeTextResult(payload)
      }
    ],
    structuredContent: payload,
    isError: payload.success === false
  };
}

function ensureOneOf(values: Array<string | undefined>, message: string): void {
  if (!values.some((value) => value && value.trim())) {
    throw new Error(message);
  }
}

export function createCustomsMcpServer(config: AppConfig): McpServer {
  const client = new CustomsApiClient(config);
  const server = new McpServer({
    name: "customs-mcp-server",
    version: "0.1.0"
  });

  server.tool(
    "customs_get_declaration_status",
    "根据报关单号(entryId)或统一编号(seqNo)查询当前申报状态。",
    {
      entryId: z.string().trim().optional().describe("报关单号"),
      seqNo: z.string().trim().optional().describe("统一编号")
    },
    async ({ entryId, seqNo }) => {
      ensureOneOf([entryId, seqNo], "entryId 和 seqNo 至少需要提供一个");
      return toToolResult(await client.queryDeclarationStatus(entryId, seqNo));
    }
  );

  server.tool(
    "customs_query_declaration_list",
    "按进出口标志、报关单号、提运单号、时间范围查询报关单列表。",
    {
      ieFlag: z.enum(["I", "E"]).optional().describe("进出口标志：I=进口，E=出口"),
      entryId: z.string().trim().optional().describe("报关单号或统一编号"),
      billNo: z.string().trim().optional().describe("提运单号"),
      beginTime: z.string().trim().optional().describe("开始日期，格式 yyyy-MM-dd"),
      endTime: z.string().trim().optional().describe("结束日期，格式 yyyy-MM-dd")
    },
    async ({ ieFlag, entryId, billNo, beginTime, endTime }) => {
      ensureOneOf(
        [entryId, billNo, beginTime, endTime],
        "entryId、billNo、beginTime、endTime 至少需要提供一个"
      );
      return toToolResult(
        await client.queryDeclarationList(ieFlag, entryId, billNo, beginTime, endTime)
      );
    }
  );

  server.tool(
    "customs_get_declaration_detail",
    "根据报关单号或统一编号获取报关单全量详情。",
    {
      cusCiqNo: z.string().trim().min(1).describe("报关单号或统一编号")
    },
    async ({ cusCiqNo }) => toToolResult(await client.queryDeclarationDetail(cusCiqNo))
  );

  server.tool(
    "customs_get_import_export_status",
    "查询报关单或提运单对应的进出口流转状态；未指定 ieFlag 时会按进口(I)后出口(E)自动兜底。",
    {
      ieFlag: z.enum(["I", "E"]).optional().describe("进出口标志：I=进口，E=出口"),
      entryId: z.string().trim().optional().describe("报关单号"),
      billNo: z.string().trim().optional().describe("提运单号")
    },
    async ({ ieFlag, entryId, billNo }) => {
      ensureOneOf([entryId, billNo], "entryId 和 billNo 至少需要提供一个");
      return toToolResult(await client.queryImportExportStatus(ieFlag, entryId, billNo));
    }
  );

  server.tool(
    "customs_query_tariff_info",
    "根据 HS 编码(hscode)或商品名称(hsname)查询税则信息。",
    {
      hscode: z.string().trim().optional().describe("HS 编码"),
      hsname: z.string().trim().optional().describe("商品名称")
    },
    async ({ hscode, hsname }) => {
      ensureOneOf([hscode, hsname], "hscode 和 hsname 至少需要提供一个");
      return toToolResult(await client.queryTariffInfo(hscode, hsname));
    }
  );

  server.tool(
    "customs_get_full_process_tracking",
    "根据提运单号(billNo)或报关单号(customsNo)查询海关全流程流转轨迹，底层复用 getSwIEStatus；未指定 ieFlag 时会按进口(I)后出口(E)自动兜底。",
    {
      ieFlag: z.enum(["I", "E"]).optional().describe("进出口标志：I=进口，E=出口"),
      billNo: z.string().trim().optional().describe("提运单号"),
      customsNo: z.string().trim().optional().describe("报关单号")
    },
    async ({ ieFlag, billNo, customsNo }) => {
      ensureOneOf([billNo, customsNo], "billNo 和 customsNo 至少需要提供一个");
      return toToolResult(await client.queryFullProcessTracking(ieFlag, billNo, customsNo));
    }
  );

  return server;
}
