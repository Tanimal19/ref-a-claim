import {
  STANCES,
  documentFormat,
  type DocumentFormat,
  type ParsedDocument,
  type Passage,
  type StanceResult,
  type TextRange,
} from "./types.ts";
import type { Outcome } from "./results.ts";

const FORMAT = "ref-a-claim/run";

const MEDIA_TYPES: Record<DocumentFormat, string> = {
  pdf: "application/pdf",
  markdown: "text/markdown",
  text: "text/plain",
};

export type FinishedStatus = "done" | "cancelled" | "failed";

/** An exported analysis: everything needed to show its results again without re-reading or re-running. */
export interface RunFile {
  format: typeof FORMAT;
  exportedAt: string;
  claim: string;
  status: FinishedStatus;
  error?: string;
  documents: RunFileDocument[];
  /** Keyed by passage ID; passages the run never reached have no entry. */
  outcomes: Record<string, Outcome>;
}

/** A document together with the file it was read from, base64-encoded, so the original can be shown again. */
export interface RunFileDocument extends ParsedDocument {
  source: string;
}

/** An opened results file, with each document's original file keyed by document path. */
export interface OpenedRun {
  claim: string;
  status: FinishedStatus;
  error?: string;
  documents: ParsedDocument[];
  outcomes: Record<string, Outcome>;
  files: Map<string, File>;
}

export async function createRunFile(run: {
  claim: string;
  status: FinishedStatus;
  error?: string;
  documents: ParsedDocument[];
  /** Keyed by document path. */
  files: ReadonlyMap<string, Blob>;
  outcomes: ReadonlyMap<string, Outcome>;
}): Promise<RunFile> {
  const documents = await Promise.all(
    run.documents.map(async (document) => {
      const file = run.files.get(document.path);
      if (!file) throw new Error(`The original file of ${document.path} is no longer available.`);
      return { ...document, source: toBase64(new Uint8Array(await file.arrayBuffer())) };
    }),
  );
  return {
    format: FORMAT,
    exportedAt: new Date().toISOString(),
    claim: run.claim,
    status: run.status,
    ...(run.error === undefined ? {} : { error: run.error }),
    documents,
    outcomes: Object.fromEntries(run.outcomes),
  };
}

export function downloadRunFile(runFile: RunFile): void {
  const blob = new Blob([JSON.stringify(runFile, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ref-a-claim-${runFile.exportedAt.slice(0, 19).replaceAll(":", "-")}.json`;
  link.click();
  // Revoking in the same task can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url));
}

/** Parses and validates an exported file, throwing an `Error` with a user-facing message if it is unusable. */
export async function readRunFile(file: File): Promise<OpenedRun> {
  let value: unknown;
  try {
    value = JSON.parse(await file.text());
  } catch {
    throw new Error(`${file.name} is not a valid JSON file.`);
  }
  if (!isRecord(value) || value.format !== FORMAT) {
    throw new Error(`${file.name} is not a ref-a-claim results file.`);
  }

  const malformed = new Error(`${file.name} is malformed and cannot be opened.`);
  const { exportedAt, claim, status, error, documents, outcomes } = value;
  if (
    typeof exportedAt !== "string" ||
    typeof claim !== "string" ||
    !isFinishedStatus(status) ||
    (error !== undefined && typeof error !== "string") ||
    !Array.isArray(documents) ||
    !documents.every(isRunFileDocument) ||
    !isRecord(outcomes)
  ) {
    throw malformed;
  }

  // IDs double as React keys and outcome keys, so they must be unique and every outcome must match a passage.
  const passageIds = new Set(documents.flatMap((doc) => doc.passages.map((passage) => passage.id)));
  const passageCount = documents.reduce((sum, doc) => sum + doc.passages.length, 0);
  const documentIds = new Set(documents.map((doc) => doc.id));
  const documentPaths = new Set(documents.map((doc) => doc.path));
  if (
    passageIds.size !== passageCount ||
    documentIds.size !== documents.length ||
    documentPaths.size !== documents.length
  ) {
    throw malformed;
  }
  for (const [passageId, outcome] of Object.entries(outcomes)) {
    if (!passageIds.has(passageId) || !isOutcome(outcome)) throw malformed;
    if (outcome.kind === "result" && outcome.result.passageId !== passageId) throw malformed;
  }

  const files = new Map<string, File>();
  for (const { path, source } of documents) {
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = fromBase64(source);
    } catch {
      throw malformed;
    }
    const format = documentFormat(path);
    const options = format === undefined ? undefined : { type: MEDIA_TYPES[format] };
    files.set(path, new File([bytes], path.slice(path.lastIndexOf("/") + 1), options));
  }

  return {
    claim,
    status,
    ...(error === undefined ? {} : { error }),
    documents: documents.map(({ source: _, ...document }) => document),
    outcomes: outcomes as Record<string, Outcome>,
    files,
  };
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  // Spread in slices: one argument per byte would overflow the call stack on a large file.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFinishedStatus(value: unknown): value is FinishedStatus {
  return value === "done" || value === "cancelled" || value === "failed";
}

function isParsedDocument(value: unknown): value is ParsedDocument {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.path === "string" &&
    Array.isArray(value.passages) &&
    value.passages.every(isPassage)
  );
}

function isRunFileDocument(value: unknown): value is RunFileDocument {
  return isRecord(value) && typeof value.source === "string" && isParsedDocument(value);
}

function isPassage(value: unknown): value is Passage {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isFiniteNumber(value.index) &&
    typeof value.text === "string" &&
    (value.page === undefined || isFiniteNumber(value.page)) &&
    (value.heading === undefined || typeof value.heading === "string") &&
    (value.textRanges === undefined || (Array.isArray(value.textRanges) && value.textRanges.every(isTextRange)))
  );
}

function isTextRange(value: unknown): value is TextRange {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.item) &&
    Number.isSafeInteger(value.start) &&
    Number.isSafeInteger(value.end) &&
    (value.item as number) >= 0 &&
    (value.start as number) >= 0 &&
    (value.end as number) > (value.start as number)
  );
}

function isOutcome(value: unknown): value is Outcome {
  if (!isRecord(value)) return false;
  if (value.kind === "failure") return typeof value.message === "string";
  return value.kind === "result" && isStanceResult(value.result);
}

function isStanceResult(value: unknown): value is StanceResult {
  return (
    isRecord(value) &&
    typeof value.passageId === "string" &&
    (STANCES as readonly unknown[]).includes(value.stance) &&
    isFiniteNumber(value.confidence) &&
    isRecord(value.probabilities) &&
    STANCES.every((stance) => isFiniteNumber((value.probabilities as Record<string, unknown>)[stance])) &&
    typeof value.model === "string" &&
    isRecord(value.usage) &&
    isFiniteNumber(value.usage.inputTokens) &&
    isFiniteNumber(value.usage.outputTokens)
  );
}
