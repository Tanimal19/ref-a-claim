import { CONTEXT_PARAGRAPHS_MAX, PASSAGE_MAX_CHARS_MAX, PASSAGE_MAX_CHARS_MIN, type Settings } from "./types.ts";

/** What the SDK uses when no model is given. */
export const DEFAULT_MODEL = "jev-latest";

const API_KEY_KEY = "ref-a-claim:api-key";
const PREFERENCES_KEY = "ref-a-claim:settings";

const DEFAULTS: Settings = { model: "", passageMaxChars: 1500, contextParagraphs: 1, contextHeading: true };

/**
 * The API key lives in `sessionStorage` so it ends with the tab; the other settings are harmless and outlive it in
 * `localStorage`. Storage can be unavailable (e.g. blocked site data); settings then last only as long as the page.
 */
export function loadSettings(): Settings {
  const apiKey = attempt(() => sessionStorage.getItem(API_KEY_KEY))?.trim() || undefined;
  const stored = parse(attempt(() => localStorage.getItem(PREFERENCES_KEY)));
  const { model, passageMaxChars, contextParagraphs, contextHeading } = stored;
  return {
    ...(apiKey === undefined ? {} : { apiKey }),
    model: typeof model === "string" ? model.trim() : DEFAULTS.model,
    passageMaxChars: isIntIn(passageMaxChars, PASSAGE_MAX_CHARS_MIN, PASSAGE_MAX_CHARS_MAX)
      ? passageMaxChars
      : DEFAULTS.passageMaxChars,
    contextParagraphs: isIntIn(contextParagraphs, 0, CONTEXT_PARAGRAPHS_MAX) ? contextParagraphs : DEFAULTS.contextParagraphs,
    contextHeading: typeof contextHeading === "boolean" ? contextHeading : DEFAULTS.contextHeading,
  };
}

export function saveSettings({ apiKey, ...preferences }: Settings): void {
  attempt(() =>
    apiKey === undefined ? sessionStorage.removeItem(API_KEY_KEY) : sessionStorage.setItem(API_KEY_KEY, apiKey),
  );
  attempt(() => localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences)));
}

/** Runs a storage access, treating a throwing accessor (blocked or full storage) as nothing stored. */
function attempt<T>(access: () => T): T | undefined {
  try {
    return access();
  } catch {
    return undefined;
  }
}

function parse(json: string | null | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    const value: unknown = JSON.parse(json);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function isIntIn(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}
