/**
 * AI-maker (AI-powered customs declaration generation) — two capabilities.
 *
 *   - submit  — upload one or more declaration source documents,
 *               return a `decId` immediately (no-wait mode).
 *               The AI agent should periodically poll `status` until
 *               `finished: true`, typically 3-10 minutes.
 *
 *   - status  — single status query by `decId`. Returns `finished`,
 *               `status` code, `statusDesc`, and optional `errorMsg`.
 *
 * v1.0.0 design choice: submit defaults to no-wait. MCP tool calls
 * cannot reliably stay open for 10 minutes (most clients timeout much
 * sooner), so we shift the polling responsibility to the model client.
 *
 * File constraints (mirrored from backend `AgentAiMakerActionController`):
 *   - Extension whitelist (lowercase, period-stripped):
 *     pdf / doc / docx / xls / xlsx / jpg / jpeg / png / zip / txt / html / htm / rtf
 *   - Total size per submission ≤ 10 MiB (10 × 1024 × 1024 = 10,485,760 bytes)
 *
 * @author ZHANGCHAO
 */

import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";

import {
  FileTooLargeError,
  InvalidArgumentError,
  MissingDecIdError,
  UnsupportedFormatError,
} from "../errors/types.js";
import type { JeecgResult } from "../http/client.js";
import type { ResolvedIdentity } from "../identity.js";
import type { ExecutionContext } from "../tools/_common.js";

const ACTION_AI_MAKER = "agent:ai:maker";
const ACTION_AI_MAKER_STATUS = "agent:ai:makerStatus";

/** Allowed file extensions (lowercase, no dot). */
const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "doc", "docx",
  "xls", "xlsx",
  "jpg", "jpeg", "png",
  "zip",
  "txt",
  "html", "htm",
  "rtf",
]);
const FORMATS_DISPLAY = "PDF / Word / Excel / JPG / PNG / ZIP / TXT / HTML / RTF";

/** Backend cap on a single submission's total file size: 10 MiB. */
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;

/** Result of validating + loading a single file from disk. */
interface LoadedFile {
  readonly filename: string;
  readonly extension: string;
  readonly size: number;
  readonly data: Uint8Array;
  readonly contentType: string;
}

// ─────────────────────────────────────────────────────────────────
// submit  (no-wait by default — returns decId immediately)
// ─────────────────────────────────────────────────────────────────

export interface AiMakerSubmitParams {
  ieFlag: "I" | "E";
  /** Absolute paths to local files; backend reads via multipart upload. */
  filePaths: ReadonlyArray<string>;
}

export interface AiMakerSubmitResult {
  decId: string;
  statusDesc?: string;
}

export async function submitAiMaker(
  ctx: ExecutionContext,
  identity: ResolvedIdentity,
  params: AiMakerSubmitParams,
): Promise<JeecgResult<AiMakerSubmitResult>> {
  const files = await loadAndValidateFiles(params.filePaths);

  const grant = await ctx.grant.grantFor(identity, ACTION_AI_MAKER);
  const response = await ctx.http.postMultipart(
    "/action/v1/ai/maker",
    { ieFlag: params.ieFlag },
    files.map((file) => ({
      name: "files[]", // backend @RequestParam("files[]") MultipartFile[]
      filename: file.filename,
      data: file.data,
      contentType: file.contentType,
    })),
    { grant },
  );

  const decId = extractDecId(response);
  if (!decId) {
    throw new MissingDecIdError(
      "Backend accepted the AI-maker submission but did not return a decId",
      { upstream: response },
    );
  }
  return response as JeecgResult<AiMakerSubmitResult>;
}

// ─────────────────────────────────────────────────────────────────
// status  (single non-polling query)
// ─────────────────────────────────────────────────────────────────

export interface AiMakerStatusParams {
  decId: string;
}

export interface AiMakerStatusResult {
  decId?: string;
  finished?: boolean;
  status?: string;
  statusDesc?: string;
  errorMsg?: string;
  updateTime?: string;
  records?: unknown[];
}

export async function queryAiMakerStatus(
  ctx: ExecutionContext,
  identity: ResolvedIdentity,
  params: AiMakerStatusParams,
): Promise<JeecgResult<AiMakerStatusResult>> {
  const grant = await ctx.grant.grantFor(identity, ACTION_AI_MAKER_STATUS);
  const response = await ctx.http.get(
    "/v1/ai/makerStatus",
    { decId: params.decId },
    { grant },
  );
  return response as JeecgResult<AiMakerStatusResult>;
}

// ─────────────────────────────────────────────────────────────────
// File loading + validation
// ─────────────────────────────────────────────────────────────────

async function loadAndValidateFiles(
  filePaths: ReadonlyArray<string>,
): Promise<LoadedFile[]> {
  if (filePaths.length === 0) {
    throw new InvalidArgumentError("At least one file path is required");
  }

  const loaded: LoadedFile[] = [];
  let totalBytes = 0;

  for (const filePath of filePaths) {
    const fileInfo = await statSafely(filePath);
    const filename = basename(filePath);
    const extension = extname(filename).slice(1).toLowerCase();

    if (!extension || !ALLOWED_EXTENSIONS.has(extension)) {
      throw new UnsupportedFormatError(
        `File "${filename}" has an unsupported extension. Allowed: ${FORMATS_DISPLAY}`,
        { filename, extension },
      );
    }

    const data = await readFile(filePath);
    totalBytes += fileInfo.size;
    loaded.push({
      filename,
      extension,
      size: fileInfo.size,
      data: new Uint8Array(data),
      contentType: guessContentType(extension),
    });
  }

  if (totalBytes > MAX_TOTAL_BYTES) {
    throw new FileTooLargeError(
      `Submission total ${totalBytes} bytes exceeds the 10 MiB per-submission limit. ` +
      `Please reduce file sizes or split into multiple submissions.`,
      { totalBytes, limit: MAX_TOTAL_BYTES, fileCount: filePaths.length },
    );
  }

  return loaded;
}

async function statSafely(filePath: string): Promise<{ size: number }> {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      throw new InvalidArgumentError(`Path is not a regular file: ${filePath}`, {
        filePath,
      });
    }
    return { size: info.size };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      throw new InvalidArgumentError(`File does not exist: ${filePath}`, { filePath });
    }
    throw error;
  }
}

function guessContentType(extension: string): string {
  switch (extension) {
    case "pdf":
      return "application/pdf";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xls":
      return "application/vnd.ms-excel";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "zip":
      return "application/zip";
    case "txt":
      return "text/plain";
    case "html":
    case "htm":
      return "text/html";
    case "rtf":
      return "application/rtf";
    default:
      return "application/octet-stream";
  }
}

function extractDecId(response: JeecgResult): string {
  const result = response.result;
  if (!result || typeof result !== "object") return "";
  const decId = (result as { decId?: unknown }).decId;
  if (decId === null || decId === undefined) return "";
  return String(decId).trim();
}
