/**
 * Translate {@link McpServerError}s into human-readable, actionable English
 * guidance for MCP tool output.
 *
 * Why translate at the MCP layer (and not just pass `code` through)?
 *
 *   - The MCP audience is AI models / IDEs that show errors directly to
 *     end users. A code like `NEED_BIND` is meaningless unless the user
 *     knows the customs-skill conventions; a sentence like "ask your admin
 *     to insert a binding row..." is universally actionable.
 *   - The original `code` is preserved in `structuredContent` so advanced
 *     clients can still build code-based UX (e.g. linking to docs).
 *
 * Adding a new translation:
 *   1. Add a row to TRANSLATIONS keyed by the {@link McpServerError.code}
 *   2. The function receives the error and returns a complete sentence
 *   3. Tests in `tests/unit/translate.test.ts` should assert at minimum
 *      that the rendered message mentions all relevant identity / context
 *      fields the user needs to act
 *
 * @author ZHANGCHAO
 */

import { McpServerError, type ErrorContext } from "./types.js";

/** A translator turns an error into English guidance shown to the user. */
type Translator = (error: McpServerError) => string;

const REPO_URL = "https://github.com/yak33/customs-mcp-server";
const IDENTITY_DOC_URL = `${REPO_URL}/blob/main/docs/identity-binding.md`;
const README_URL = `${REPO_URL}/blob/main/README.md`;

/**
 * Map of error code → translator. When a code has no entry, the default
 * formatter ({@link defaultTranslate}) simply returns the error message
 * unchanged.
 */
const TRANSLATIONS: Record<string, Translator> = {
  NEED_BIND: (error) => {
    const id = formatIdentity(error.context);
    return (
      `Authentication failed: identity ${id} is not registered in the customs ` +
      `backend. Please ask your admin to add a binding row to ` +
      `\`agent_identity_binding\`. See ${IDENTITY_DOC_URL} for the schema.`
    );
  },

  NEED_TENANT: (error) => {
    const id = formatIdentity(error.context);
    const reason = error.context.reason ? ` (reason: ${error.context.reason})` : "";
    return (
      `Identity ${id} is associated with multiple tenants and no default is set` +
      `${reason}. Please ask your admin to set a \`default_tenant_id\` on the ` +
      `corresponding \`agent_identity_binding\` row.`
    );
  },

  MISSING_CONFIG: (error) => {
    const variable = error.context.variable;
    return variable
      ? `Missing required environment variable: \`${variable}\`. See ${README_URL} → Environment Variables.`
      : error.message;
  },

  INVALID_ARGUMENT: (error) => error.message, // user-facing message is already actionable

  UNSUPPORTED_FORMAT: (error) =>
    `${error.message} (Allowed formats: PDF / Word / Excel / JPG / PNG / ZIP / TXT / HTML / RTF.)`,

  FILE_TOO_LARGE: (error) =>
    `${error.message} Please reduce the total size or split into multiple submissions.`,

  MISSING_DEC_ID: (error) =>
    `The customs backend accepted the submission but did not return a \`decId\`. ` +
    `This usually indicates an upstream configuration issue — contact your admin. ` +
    `Original message: "${error.message}"`,

  NETWORK_ERROR: (error) =>
    `Network error reaching the customs backend: ${error.message}. ` +
    `Please retry; if the problem persists, verify \`CUSTOMS_API_BASE_URL\` and network connectivity.`,

  UPSTREAM_ERROR: (error) => {
    const upstream = error.context.upstream as { code?: unknown; message?: unknown } | undefined;
    if (upstream && typeof upstream.message === "string" && upstream.message) {
      return `Customs backend rejected the request (code=${upstream.code}): ${upstream.message}`;
    }
    return `Customs backend rejected the request: ${error.message}`;
  },
};

/**
 * Public entry point: translate any error into an English guidance string
 * suitable for MCP tool `content[].text`.
 */
export function translateError(error: McpServerError): string {
  const translator = TRANSLATIONS[error.code] ?? defaultTranslate;
  return translator(error);
}

function defaultTranslate(error: McpServerError): string {
  return error.message;
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function formatIdentity(ctx: ErrorContext): string {
  const platform = ctx.platform ?? "unknown";
  const userId = ctx.externalUserId ?? "unknown";
  return `\`(platform="${platform}", externalUserId="${userId}")\``;
}
