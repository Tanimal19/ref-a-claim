import { AuthenticationError, PermissionDeniedError } from "@typesafe-ai/sdk";
import { stanceClassifierFor } from "./jev.ts";
import type { AnalyzePassage, ParsedDocument, PassageFailure, Passage, Settings, StanceResult } from "./types.ts";

const CONCURRENCY = 8;
const NO_API_KEY = "No TypeSafe API key is configured. Add one in Settings.";

export interface AnalyzeHandlers {
  onResult: (result: StanceResult) => void;
  onFailure: (failure: PassageFailure) => void;
}

/**
 * Classifies every passage against `claim`, reporting each outcome as it arrives. Resolves once all passages have an
 * outcome; rejects when `signal` aborts, or with the first error that would fail every passage (a rejected API key).
 */
export async function analyze(
  claim: string,
  documents: readonly ParsedDocument[],
  settings: Settings,
  signal: AbortSignal,
  handlers: AnalyzeHandlers,
): Promise<void> {
  if (settings.apiKey === undefined) throw new Error(NO_API_KEY);
  const classify = stanceClassifierFor(settings.apiKey, settings.model || undefined);
  const trimmedClaim = claim.trim();
  const passages = documents.flatMap((doc) => doc.passages.map((_, i) => withContext(doc.passages, i, settings)));

  // Stops the remaining requests on a fatal error without it looking like the user cancelled.
  const fatal = new AbortController();
  const stop = AbortSignal.any([signal, fatal.signal]);
  let fatalError: unknown;

  await forEachConcurrent(passages, CONCURRENCY, stop, async (passage) => {
    try {
      handlers.onResult(await classify(trimmedClaim, passage, stop));
    } catch (error) {
      if (stop.aborted) return;
      if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
        fatalError = error;
        fatal.abort();
        return;
      }
      handlers.onFailure({ passageId: passage.id, message: error instanceof Error ? error.message : String(error) });
    }
  });
  signal.throwIfAborted();
  if (fatalError !== undefined) throw fatalError;
}

/** Runs `fn` over `items` with at most `limit` in flight, stopping early once `signal` aborts. */
async function forEachConcurrent<T>(
  items: readonly T[],
  limit: number,
  signal: AbortSignal,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length && !signal.aborted) {
      await fn(items[next++]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function withContext(passages: readonly Passage[], i: number, settings: Settings): AnalyzePassage {
  const { id, text, heading } = passages[i]!;
  const n = settings.contextParagraphs;
  const join = (neighbours: readonly Passage[]) =>
    neighbours.length === 0 ? undefined : neighbours.map((passage) => passage.text).join("\n\n");
  const context = {
    heading: settings.contextHeading ? heading : undefined,
    before: join(passages.slice(Math.max(0, i - n), i)),
    after: join(passages.slice(i + 1, i + 1 + n)),
  };
  const present = Object.entries(context).filter(([, value]) => value !== undefined);
  return present.length === 0 ? { id, text } : { id, text, context: Object.fromEntries(present) };
}
