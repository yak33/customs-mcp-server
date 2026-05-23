/**
 * HTTP client facade for the customs backend.
 *
 * Wraps Node 18+ built-in `fetch` with:
 *   - signature header injection (every request)
 *   - optional grant header injection (when a `GrantHeaders` is provided)
 *   - JSON decoding with graceful fallback for non-JSON responses
 *   - structured error translation (network failures vs. upstream business errors)
 *   - per-request timeout via `AbortController`
 *
 * Zero runtime dependencies: just `globalThis.fetch` + the project's `Signer`.
 *
 * @author ZHANGCHAO
 */

import { randomUUID } from "node:crypto";

import type { AppConfig } from "../config.js";
import { NetworkError, UpstreamError } from "../errors/types.js";
import { logDebug } from "../logging.js";
import {
  type GrantHeaders,
  type SignedHeaders,
  Signer,
  buildQuery,
  grantHeadersToRecord,
  signedHeadersToRecord,
} from "../auth/signer.js";

/**
 * Generic JEECG-style response envelope shared by every customs backend API.
 * Fields are loosely typed because each endpoint adds its own keys.
 */
export interface JeecgResult<T = unknown> {
  success?: boolean;
  code?: number | string;
  message?: string;
  result?: T;
  timestamp?: number;
  [key: string]: unknown;
}

export interface RequestOptions {
  /** Override the default request timeout (ms). */
  timeout?: number;
  /** When set, attach the `X-Access-Token` / `Tenant-Id` / `X-Agent-Action-Code` headers. */
  grant?: GrantHeaders;
}

type ParamValue = string | number | boolean | null | undefined;

export class HttpClient {
  readonly #config: AppConfig;
  readonly #signer: Signer;

  public constructor(config: AppConfig, signer: Signer) {
    this.#config = config;
    this.#signer = signer;
  }

  // ─────────────────────────────────────────────────
  // GET
  // ─────────────────────────────────────────────────

  /**
   * Signed GET request. `params` are URL-encoded and become part of the
   * signature source string. Empty / null values are skipped.
   */
  public async get(
    path: string,
    params: Record<string, ParamValue> = {},
    opts: RequestOptions = {},
  ): Promise<JeecgResult> {
    const queryString = buildQuery(params);
    const url = this.#urlOf(path, queryString);
    const signed = this.#signer.sign(queryString);
    const headers = this.#assembleHeaders(signed, opts.grant);
    return this.#request("GET", url, headers, undefined, opts.timeout);
  }

  // ─────────────────────────────────────────────────
  // POST JSON
  // ─────────────────────────────────────────────────

  /**
   * Signed POST with a JSON body. The body does NOT participate in the
   * signature source string (matches the backend `AuthKit` rule for POST).
   */
  public async postJson(
    path: string,
    body: Record<string, unknown>,
    opts: RequestOptions = {},
  ): Promise<JeecgResult> {
    const url = this.#urlOf(path, "");
    const signed = this.#signer.sign("");
    const headers: Record<string, string> = {
      ...this.#assembleHeaders(signed, opts.grant),
      "Content-Type": "application/json;charset=UTF-8",
    };
    const payload = JSON.stringify(body);
    return this.#request("POST", url, headers, payload, opts.timeout);
  }

  // ─────────────────────────────────────────────────
  // POST multipart/form-data
  // ─────────────────────────────────────────────────

  /**
   * Signed POST with `multipart/form-data` body, used for AI-maker file uploads.
   *
   * Same signature rule as POST JSON: body does not participate in signing.
   * The Content-Type header (with the boundary) is auto-set by the runtime
   * when we pass a `FormData` body — do NOT override it manually.
   *
   * The default request timeout for this method is the upload-specific
   * timeout (`customsUploadTimeoutMs`), not the regular one.
   */
  public async postMultipart(
    path: string,
    fields: Record<string, string>,
    files: ReadonlyArray<{ name: string; filename: string; data: Uint8Array; contentType?: string }>,
    opts: RequestOptions = {},
  ): Promise<JeecgResult> {
    const url = this.#urlOf(path, "");
    const signed = this.#signer.sign("");
    const headers = this.#assembleHeaders(signed, opts.grant);
    // CRITICAL: do not set Content-Type — fetch/FormData picks the boundary

    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) {
      form.append(name, value);
    }
    for (const file of files) {
      // Wrap in ArrayBuffer slice so the Blob constructor sees a concrete
      // ArrayBuffer (Uint8Array.buffer may be `ArrayBufferLike`, which TS strict rejects).
      const ab = file.data.buffer.slice(
        file.data.byteOffset,
        file.data.byteOffset + file.data.byteLength,
      ) as ArrayBuffer;
      const blob = new Blob([ab], {
        type: file.contentType ?? "application/octet-stream",
      });
      form.append(file.name, blob, file.filename);
    }

    const effectiveTimeout = opts.timeout ?? this.#config.customsUploadTimeoutMs;
    return this.#request("POST", url, headers, form, effectiveTimeout);
  }

  // ─────────────────────────────────────────────────
  // Internal: URL + headers + fetch + decoding
  // ─────────────────────────────────────────────────

  #urlOf(path: string, queryString: string): string {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const base = `${this.#config.customsApiBaseUrl}${this.#config.customsApiPrefix}${normalized}`;
    return queryString ? `${base}?${queryString}` : base;
  }

  #assembleHeaders(
    signed: SignedHeaders,
    grant?: GrantHeaders,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      ...signedHeadersToRecord(signed),
    };
    if (grant) {
      Object.assign(headers, grantHeadersToRecord(grant));
    }
    return headers;
  }

  async #request(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: string | FormData | undefined,
    timeout: number | undefined,
  ): Promise<JeecgResult> {
    const effectiveTimeout = timeout ?? this.#config.customsTimeoutMs;
    const requestId = randomUUID().slice(0, 8);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), effectiveTimeout);

    logDebug("http.request", { id: requestId, method, url });

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
    } catch (error) {
      if ((error as Error)?.name === "AbortError") {
        throw new NetworkError(
          `Upstream request timed out after ${effectiveTimeout}ms`,
          { requestId, method, url },
          error,
        );
      }
      throw new NetworkError(
        `Failed to reach customs backend: ${(error as Error)?.message ?? error}`,
        { requestId, method, url },
        error,
      );
    } finally {
      clearTimeout(timer);
    }

    const rawText = await response.text();
    const payload = decodePayload(rawText, response.status);

    logDebug("http.response", {
      id: requestId,
      status: response.status,
      success: payload.success,
    });

    // Backend signaled business failure or HTTP 4xx/5xx — surface as UpstreamError
    if (payload.success === false || !response.ok) {
      if (payload.success === undefined) payload.success = false;
      if (payload.code === undefined && !response.ok) payload.code = response.status;
      throw new UpstreamError(
        typeof payload.message === "string" && payload.message
          ? payload.message
          : `Customs backend returned ${response.status}`,
        { upstream: payload, requestId },
      );
    }

    return payload;
  }
}

// ─────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────

function decodePayload(text: string, status: number): JeecgResult {
  if (!text) {
    return { success: false, code: status, message: "Empty response body" };
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    return {
      success: false,
      code: status,
      message: "Upstream returned a non-JSON response",
      result: text,
    };
  }
  if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)) {
    return {
      success: false,
      code: status,
      message: "Upstream returned a non-object JSON body",
      result: decoded,
    };
  }
  return decoded as JeecgResult;
}
