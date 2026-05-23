/**
 * Signer + buildQuery byte-alignment tests.
 *
 * These guard the single most fragile interaction with the customs backend:
 * any deviation from `AuthKit.verifySign`'s source-string rule causes 401.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { Signer, buildQuery } from "../../src/auth/signer.js";

const SECRET = "TestSecret-1234567890";

function md5(s: string): string {
  return createHash("md5").update(s, "utf8").digest("hex");
}

describe("Signer", () => {
  it("emits all 4 required headers with correct shapes", () => {
    const signer = new Signer("AK", SECRET, "Asia/Shanghai");
    const headers = signer.sign("a=1");

    expect(headers.accessKey).toBe("AK");
    expect(headers.sign).toHaveLength(32);
    expect(headers.timestamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(headers.nonce).toMatch(/^\d{19,}$/);
  });

  it("sign() with non-empty query: ${q}&${ts}&${nonce}&${secret}", () => {
    const signer = new Signer("AK", SECRET, "Asia/Shanghai");
    const headers = signer.sign("a=1&b=2");
    const expected = md5(`a=1&b=2&${headers.timestamp}&${headers.nonce}&${SECRET}`);
    expect(headers.sign).toBe(expected);
  });

  it("sign() with empty query keeps the leading '&'", () => {
    const signer = new Signer("AK", SECRET, "Asia/Shanghai");
    const headers = signer.sign("");
    const expected = md5(`&${headers.timestamp}&${headers.nonce}&${SECRET}`);
    expect(headers.sign).toBe(expected);

    // sanity: dropping the leading '&' must yield a different hash
    const wrong = md5(`${headers.timestamp}&${headers.nonce}&${SECRET}`);
    expect(wrong).not.toBe(expected);
  });

  it("generates fresh nonce per call (no naive repeats)", () => {
    const signer = new Signer("AK", SECRET, "Asia/Shanghai");
    const nonces = new Set<string>();
    for (let i = 0; i < 20; i++) nonces.add(signer.sign("").nonce);
    expect(nonces.size).toBeGreaterThan(10);
  });

  it("returns a frozen headers object (no mutation)", () => {
    const signer = new Signer("AK", SECRET, "Asia/Shanghai");
    const headers = signer.sign("");
    expect(Object.isFrozen(headers)).toBe(true);
  });
});

describe("buildQuery", () => {
  it("skips null / undefined / empty values", () => {
    expect(
      buildQuery({ a: "1", b: null, c: undefined, d: "", e: "2" }),
    ).toBe("a=1&e=2");
  });

  it("URL-encodes Chinese values", () => {
    // 出口 → %E5%87%BA%E5%8F%A3
    expect(buildQuery({ name: "出口" })).toBe("name=%E5%87%BA%E5%8F%A3");
  });

  it("URL-encodes special characters that would break query syntax", () => {
    expect(buildQuery({ q: "a&b=c" })).toBe("q=a%26b%3Dc");
  });

  it("returns empty string for empty params", () => {
    expect(buildQuery({})).toBe("");
  });

  it("preserves insertion order (matches Python dict semantics)", () => {
    expect(buildQuery({ z: "1", a: "2", m: "3" })).toBe("z=1&a=2&m=3");
  });

  it("stringifies non-string values", () => {
    expect(buildQuery({ n: 42, ok: true })).toBe("n=42&ok=true");
  });
});
