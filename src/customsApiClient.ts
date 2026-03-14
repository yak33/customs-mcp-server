import { createHash, randomInt } from "node:crypto";
import { URLSearchParams } from "node:url";

import type { AppConfig } from "./config.js";

export interface JeecgResult<T = unknown> {
  success?: boolean;
  code?: number | string;
  message?: string;
  result?: T;
  timestamp?: number;
  [key: string]: unknown;
}

type ParamValue = string | number | boolean | null | undefined;

function joinUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

function buildOrderedQuery(entries: Array<[string, ParamValue]>): string {
  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value === null || value === undefined || value === "") {
      continue;
    }
    params.append(key, String(value));
  }
  return params.toString();
}

function formatTimestamp(timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const parts = formatter.formatToParts(new Date());
  const partMap = new Map(parts.map((part) => [part.type, part.value]));
  return `${partMap.get("year")}-${partMap.get("month")}-${partMap.get("day")} ${partMap.get("hour")}:${partMap.get("minute")}:${partMap.get("second")}`;
}

function createNonce(): string {
  return `${Date.now()}${randomInt(100000, 999999)}`;
}

function sign(src: string): string {
  return createHash("md5").update(src, "utf8").digest("hex");
}

function createTransportFailure(error: unknown): JeecgResult {
  if (error instanceof Error && error.name === "AbortError") {
    return {
      success: false,
      code: "UPSTREAM_TIMEOUT",
      message: "Upstream Agent API request timed out"
    };
  }

  return {
    success: false,
    code: "UPSTREAM_REQUEST_FAILED",
    message: error instanceof Error ? error.message : "Failed to reach upstream Agent API"
  };
}

export class CustomsApiClient {
  private readonly config: AppConfig;

  public constructor(config: AppConfig) {
    this.config = config;
  }

  public async queryDeclarationStatus(entryId?: string, seqNo?: string): Promise<JeecgResult> {
    return this.get("/v1/declaration/status", [
      ["entryId", entryId],
      ["seqNo", seqNo]
    ]);
  }

  public async queryDeclarationList(
    ieFlag?: string,
    entryId?: string,
    billNo?: string,
    beginTime?: string,
    endTime?: string
  ): Promise<JeecgResult> {
    return this.get("/v1/declaration/list", [
      ["ieFlag", ieFlag],
      ["entryId", entryId],
      ["billNo", billNo],
      ["beginTime", beginTime],
      ["endTime", endTime]
    ]);
  }

  public async queryDeclarationDetail(cusCiqNo: string): Promise<JeecgResult> {
    return this.get("/v1/declaration/detail", [["cusCiqNo", cusCiqNo]]);
  }

  public async queryImportExportStatus(ieFlag?: string, entryId?: string, billNo?: string): Promise<JeecgResult> {
    return this.get("/v1/declaration/ieStatus", [
      ["ieFlag", ieFlag],
      ["entryId", entryId],
      ["billNo", billNo]
    ]);
  }

  public async queryTariffInfo(hscode?: string, hsname?: string): Promise<JeecgResult> {
    return this.get("/v1/tariff/query", [
      ["hscode", hscode],
      ["hsname", hsname]
    ]);
  }

  public async queryFullProcessTracking(
    ieFlag?: string,
    billNo?: string,
    customsNo?: string
  ): Promise<JeecgResult> {
    return this.get("/v1/tracking/fullProcess", [
      ["ieFlag", ieFlag],
      ["billNo", billNo],
      ["customsNo", customsNo]
    ]);
  }

  private async get(path: string, queryEntries: Array<[string, ParamValue]>): Promise<JeecgResult> {
    const queryString = buildOrderedQuery(queryEntries);
    const timestamp = formatTimestamp(this.config.customsTimestampTimezone);
    const nonce = createNonce();
    const route = `${this.config.customsApiPrefix}${path}`;
    const url = queryString
      ? `${joinUrl(this.config.customsApiBaseUrl, route)}?${queryString}`
      : joinUrl(this.config.customsApiBaseUrl, route);
    const signatureSource = `${queryString ? `${queryString}&` : "&"}${timestamp}&${nonce}&${this.config.customsSecretKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.customsTimeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          accessKey: this.config.customsAccessKey,
          timestamp,
          nonce,
          sign: sign(signatureSource)
        },
        signal: controller.signal
      });

      const rawText = await response.text();
      let payload: JeecgResult;
      try {
        payload = JSON.parse(rawText) as JeecgResult;
      } catch {
        payload = {
          success: false,
          code: response.status,
          message: "Upstream returned a non-JSON response",
          result: rawText
        };
      }

      if (!response.ok && payload.success !== false) {
        payload.success = false;
        payload.code = response.status;
        payload.message = payload.message || response.statusText || "HTTP request failed";
      }
      return payload;
    } catch (error) {
      return createTransportFailure(error);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
