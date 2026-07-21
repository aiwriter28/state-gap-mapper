import {
  decodeProject,
  PROJECT_FILE_BYTES,
  type StateGapMapperProjectV1,
} from "../lib/projectFile";

export { PROJECT_FILE_BYTES } from "../lib/projectFile";
export const SPEC_FILE_BYTES = 64 * 1024;

export type FileTransferErrorCode =
  | "unsupported_extension"
  | "spec_too_large"
  | "project_too_large"
  | "invalid_utf8"
  | "empty_spec"
  | "spec_too_long"
  | "malformed_json"
  | "wrong_format"
  | "unsupported_version"
  | "invalid_project"
  | "read_failed";

export class FileTransferError extends Error {
  constructor(
    readonly code: FileTransferErrorCode,
    readonly path?: string,
    readonly reason?: string,
  ) {
    super(code);
    this.name = "FileTransferError";
  }
}

export type ImportCandidate =
  | { kind: "spec"; filename: string; text: string }
  | { kind: "project"; filename: string; project: StateGapMapperProjectV1 };

const BIDI_CONTROLS = new Set([
  0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e,
  0x2066, 0x2067, 0x2068, 0x2069,
]);

export function safeDisplayFilename(filename: string): string {
  return Array.from(filename, (character) => {
    const code = character.codePointAt(0) ?? 0;
    const unsafe = code <= 0x1f || (code >= 0x7f && code <= 0x9f) || BIDI_CONTROLS.has(code);
    return unsafe ? " " : character;
  }).join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "selected file";
}

function route(filename: string): "spec" | "project" {
  const dot = filename.lastIndexOf(".");
  const extension = dot < 0 ? "" : filename.slice(dot).toLowerCase();
  if ([".txt", ".md", ".markdown"].includes(extension)) return "spec";
  if (extension === ".json") return "project";
  throw new FileTransferError("unsupported_extension");
}

async function readBytes(file: File): Promise<ArrayBuffer> {
  try {
    return await file.arrayBuffer();
  } catch {
    throw new FileTransferError("read_failed");
  }
}

function decodeUtf8(bytes: ArrayBuffer): string {
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    return decoded.startsWith("\ufeff") ? decoded.slice(1) : decoded;
  } catch {
    throw new FileTransferError("invalid_utf8");
  }
}

export async function readImportFile(file: File): Promise<ImportCandidate> {
  const kind = route(file.name);
  if (kind === "spec" && file.size > SPEC_FILE_BYTES) throw new FileTransferError("spec_too_large");
  if (kind === "project" && file.size > PROJECT_FILE_BYTES) throw new FileTransferError("project_too_large");

  const text = decodeUtf8(await readBytes(file));
  const filename = safeDisplayFilename(file.name);
  if (kind === "spec") {
    if (text.trim().length === 0) throw new FileTransferError("empty_spec");
    if (text.length > 4_000) throw new FileTransferError("spec_too_long");
    return { kind, filename, text };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new FileTransferError("malformed_json");
  }
  const decoded = decodeProject(parsed);
  if (!decoded.ok) {
    if (decoded.code === "wrong_format") throw new FileTransferError("wrong_format");
    if (decoded.code === "unsupported_version") throw new FileTransferError("unsupported_version");
    throw new FileTransferError("invalid_project", decoded.path, decoded.reason);
  }
  return { kind, filename, project: decoded.value };
}

export function triggerDownload(content: string, filename: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function exportFilename(kind: "report" | "project", date: Date): string {
  const stamp = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").replace("T", "-");
  return `state-gap-mapper-${kind}-${stamp}.${kind === "report" ? "md" : "json"}`;
}
