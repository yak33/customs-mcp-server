/**
 * Error translation tests.
 *
 * For each translatable code we assert two things:
 *   1. The rendered message mentions the actionable concept (e.g. binding,
 *      tenant, env variable) — so the AI client / end user knows what to do
 *   2. Critical identity / context fields appear verbatim, enabling humans
 *      to copy them into bug reports
 */
import { describe, expect, it } from "vitest";

import { translateError } from "../../src/errors/translate.js";
import {
  ConfigError,
  FileTooLargeError,
  MissingDecIdError,
  NeedBindError,
  NeedTenantError,
  NetworkError,
  UnsupportedFormatError,
  UpstreamError,
} from "../../src/errors/types.js";

describe("translateError", () => {
  it("NEED_BIND mentions identity + binding table + doc link", () => {
    const err = new NeedBindError({
      platform: "mcp",
      externalUserId: "alice",
    });
    const text = translateError(err);
    expect(text).toContain("platform");
    expect(text).toContain('"mcp"');
    expect(text).toContain('"alice"');
    expect(text).toContain("agent_identity_binding");
    expect(text).toContain("identity-binding.md");
  });

  it("NEED_TENANT mentions default_tenant_id guidance", () => {
    const err = new NeedTenantError({
      platform: "cursor",
      externalUserId: "bob",
      reason: "multi-tenant",
    });
    const text = translateError(err);
    expect(text).toContain("multiple tenants");
    expect(text).toContain("default_tenant_id");
    expect(text).toContain("multi-tenant"); // reason echoed back
  });

  it("MISSING_CONFIG names the missing variable", () => {
    const err = new ConfigError("Missing required env: CUSTOMS_API_BASE_URL", {
      variable: "CUSTOMS_API_BASE_URL",
    });
    const text = translateError(err);
    expect(text).toContain("CUSTOMS_API_BASE_URL");
    expect(text).toContain("Environment Variables");
  });

  it("UNSUPPORTED_FORMAT lists allowed formats", () => {
    const err = new UnsupportedFormatError(
      'File "weird.exe" has an unsupported extension.',
      { filename: "weird.exe" },
    );
    const text = translateError(err);
    expect(text).toContain("weird.exe");
    expect(text).toMatch(/PDF.*Word.*Excel/);
  });

  it("FILE_TOO_LARGE suggests splitting", () => {
    const err = new FileTooLargeError(
      "Submission total 11534336 bytes exceeds the 10 MiB limit.",
      { totalBytes: 11534336 },
    );
    const text = translateError(err);
    expect(text).toMatch(/split|reduce/i);
  });

  it("MISSING_DEC_ID quotes the original message", () => {
    const err = new MissingDecIdError("Backend gave no decId");
    const text = translateError(err);
    expect(text).toContain("Backend gave no decId");
  });

  it("NETWORK_ERROR suggests retry + base URL check", () => {
    const err = new NetworkError("ETIMEDOUT", { url: "http://x" });
    const text = translateError(err);
    expect(text).toContain("Network error");
    expect(text).toMatch(/retry/i);
    expect(text).toContain("CUSTOMS_API_BASE_URL");
  });

  it("UPSTREAM_ERROR surfaces upstream code + message when available", () => {
    const err = new UpstreamError("Validation failed", {
      upstream: { code: 422, message: "Validation failed", success: false },
    });
    const text = translateError(err);
    expect(text).toContain("422");
    expect(text).toContain("Validation failed");
  });

  it("UPSTREAM_ERROR falls back to the error message when upstream lacks message", () => {
    const err = new UpstreamError("backend went down", {
      upstream: { code: 500, success: false },
    });
    const text = translateError(err);
    expect(text).toContain("backend went down");
  });
});
