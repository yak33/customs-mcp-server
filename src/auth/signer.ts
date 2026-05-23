/**
 * MD5 signature engine, byte-aligned with the backend `AuthKit.verifySign`.
 *
 * Signature source string rules (any deviation breaks verification):
 *
 *   with query:    `${queryString}&${timestamp}&${nonce}&${secretKey}`
 *   empty query:   `&${timestamp}&${nonce}&${secretKey}`        // leading `&`
 *
 * The `timestamp` is `yyyy-MM-dd HH:mm:ss` in the configured timezone
 * (default `Asia/Shanghai`) — this matches the backend formatter exactly.
 *
 * The `nonce` is `${epochMs}${6-digit-random}` (≥ 19 chars). Backends keep
 * a short replay window, so callers should not retry with the same nonce.
 *
 * @author ZHANGCHAO
 */

import { createHash, randomInt } from "node:crypto";

/** Headers required on every signed request to the customs backend. */
export interface SignedHeaders {
  readonly accessKey: string;
  readonly timestamp: string;
  readonly nonce: string;
  readonly sign: string;
}

/** Additional headers required when the call uses a delegated agent token. */
export interface GrantHeaders {
  readonly "X-Access-Token": string;
  readonly "Tenant-Id": string;
  readonly "X-Agent-Action-Code": string;
}

export class Signer {
  readonly #accessKey: string;
  readonly #secretKey: string;
  readonly #timezone: string;

  public constructor(accessKey: string, secretKey: string, timezone: string) {
    this.#accessKey = accessKey;
    this.#secretKey = secretKey;
    this.#timezone = timezone;
  }

  /**
   * Generate one set of signed headers for a single request.
   *
   * @param queryString  URL query string WITHOUT the leading `?`,
   *                     already percent-encoded; empty for bodies w/o query
   */
  public sign(queryString: string = ""): SignedHeaders {
    const timestamp = this.#formatTimestamp();
    const nonce = this.#freshNonce();
    const prefix = queryString ? `${queryString}&` : "&";
    const source = `${prefix}${timestamp}&${nonce}&${this.#secretKey}`;
    const sign = createHash("md5").update(source, "utf8").digest("hex");
    return Object.freeze({
      accessKey: this.#accessKey,
      timestamp,
      nonce,
      sign,
    });
  }

  /** Format current time as `yyyy-MM-dd HH:mm:ss` in the configured timezone. */
  #formatTimestamp(): string {
    const formatter = new Intl.DateTimeFormat("zh-CN", {
      timeZone: this.#timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date());
    const map = new Map(parts.map((part) => [part.type, part.value]));
    return (
      `${map.get("year")}-${map.get("month")}-${map.get("day")} ` +
      `${map.get("hour")}:${map.get("minute")}:${map.get("second")}`
    );
  }

  /** `epochMs + 6-digit-random`, matches bash `gen_nonce` / Python `_fresh_nonce`. */
  #freshNonce(): string {
    return `${Date.now()}${randomInt(100_000, 1_000_000)}`;
  }
}

// ─────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────

type ParamValue = string | number | boolean | null | undefined;

/**
 * Build a URL query string from `{key: value}` entries.
 *
 * Skips `null` / `undefined` / empty-string values, preserves insertion
 * order (object keys order is stable in modern JS), and uses
 * `encodeURIComponent` for values — equivalent to Python
 * `urllib.parse.quote(safe="")` for ASCII range.
 */
export function buildQuery(params: Record<string, ParamValue>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    const str = String(value);
    if (str === "") continue;
    parts.push(`${key}=${encodeURIComponent(str)}`);
  }
  return parts.join("&");
}

/** Convert {@link SignedHeaders} to a plain header dict. */
export function signedHeadersToRecord(headers: SignedHeaders): Record<string, string> {
  return {
    accessKey: headers.accessKey,
    timestamp: headers.timestamp,
    nonce: headers.nonce,
    sign: headers.sign,
  };
}

/** Convert {@link GrantHeaders} to a plain header dict. */
export function grantHeadersToRecord(headers: GrantHeaders): Record<string, string> {
  return {
    "X-Access-Token": headers["X-Access-Token"],
    "Tenant-Id": headers["Tenant-Id"],
    "X-Agent-Action-Code": headers["X-Agent-Action-Code"],
  };
}
