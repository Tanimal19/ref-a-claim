import type { Category } from "../results.ts";

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

export const en = {
  setup: {
    title: "Check a claim against papers",
    subtitle: "See which paragraphs support, refute, or are unrelated to it.",
    noApiKey: "Add a TypeSafe API key before analyzing.",
    openSettings: "Open settings",
    claim: "Claim",
    claimPlaceholder:
      "e.g. Remote work increases employee productivity.\nRemote workers put in more hours.",
    claimHint:
      "One claim per line. Put each part of a compound claim on its own line to see which part a paragraph bears on.",
    analyze: (paragraphs: number) =>
      `Analyze ${plural(paragraphs, "paragraph")}`,
  },
  header: {
    backToResults: "Back to results →",
    github: "GitHub repository",
    settings: "Settings",
    more: "More",
    openResults: "Open results…",
    exportResults: "Export results",
    editClaim: "Edit claim & papers",
    showResultsFor: "Show results for",
    allClaims: "All",
    allClaimsDescription:
      "Every claim combined: each paragraph shows its strongest result",
    cancel: "Cancel",
    status: { done: "Done", cancelled: "Cancelled", failed: "Failed" },
    /** Labels the button that switches to the other language, in that language's own words. */
    switchLanguage: "中文",
    switchLanguageTitle: "切換為繁體中文",
  },
  documents: {
    title: "Documents",
    reading: "Reading…",
    chooseFiles: "Choose file(s)",
    pickFiles: "Files…",
    pickFolder: "Folder…",
    clear: "Clear",
    hint: (extensions: readonly string[]) =>
      `Choose or drop ${extensions.join(", ")} files here, or a folder to read those in it and its subfolders.`,
    paragraphs: (n: number) => plural(n, "paragraph"),
    remove: "Remove",
    removeLabel: (path: string) => `Remove ${path}`,
  },
  demo: {
    title: "Try a demo",
    description:
      "See the results of an analysis of sample papers. No API key needed, and nothing is sent.",
    open: "View demo",
    opening: "Opening…",
  },
  settings: {
    title: "Settings",
    api: "TypeSafe API",
    apiKey: "API key",
    apiKeyPlaceholder: "Paste your key",
    apiKeyReplacePlaceholder: "Enter a new key to replace it",
    noKey: "No key yet. Get one at console.typesafe.ai/keys.",
    keyWillBeRemoved: "The saved key will be removed",
    usingSavedKey: (lastFour: string) => `Using the saved key (…${lastFour}).`,
    keepKey: "Keep it",
    removeKey: "Remove",
    keyStorage:
      "Your key stays in this browser tab and is cleared when the tab closes. Requests go to TypeSafe through this " +
      "site’s address, which relays them without keeping anything.",
    model: "Model",
    modelPlaceholder: (model: string) => `Default: ${model}`,
    modelHint: (model: string) => `Leave empty to use ${model}.`,
    modelsError: (error: string) => `Couldn’t load the model list: ${error}`,
    paragraphs: "Paragraphs",
    maxLength: "Max length",
    characters: "characters",
    maxLengthHint:
      "Longer paragraphs are split on sentence boundaries when documents are read.",
    resplitNotice: (resplittable: number, kept: number) =>
      `Saving re-reads ${plural(resplittable, "loaded document")} with the new length and clears the current results.` +
      (kept > 0
        ? ` ${kept} opened from a results file will keep their current split.`
        : ""),
    context: "Context sent with each paragraph",
    neighbours: "Neighbouring paragraphs",
    noNeighbours: "None",
    neighboursEachSide: (n: number) => `${n} before and after`,
    includeHeading: "Include the section heading",
    contextHint:
      "The model reads context only to understand the paragraph; the stance is judged on the paragraph alone. More " +
      "context costs more input tokens. Applies to the next analysis.",
    results: "Results",
    possibleAbove: "Possibly related from",
    possibleAboveHint: (min: number, max: number) =>
      "A paragraph the model judges unrelated to a claim is shown as possibly supporting or refuting it when that " +
      `stance’s probability reaches this, from ${min} to ${max}. ${max} shows almost none. Applies to the current ` +
      "results right away.",
    cancel: "Cancel",
    save: "Save",
    saveAndReread: "Save and re-read",
  },
  usage: {
    title: "Usage",
    thisAnalysis: "This analysis",
    thisSession: "This session",
    pricing: (usdPerMillion: number) =>
      `$${usdPerMillion} per 1M input tokens. Output tokens are free. Failed requests are not counted.`,
    inputTokens: "Input tokens",
    outputTokens: "Output tokens",
    free: "(free)",
    estimatedCost: "Estimated cost",
  },
  results: {
    prevPaper: "← Prev paper",
    nextPaper: "Next paper →",
    tintedParagraphShortcut: "tinted paragraph",
    paperShortcut: "paper",
  },
  papers: {
    title: "Papers",
    sort: "Sort",
    documentOrder: "Document order",
    mostSupporting: "Most supporting",
    mostRefuting: "Most refuting",
    allPapers: "All papers",
    segment: (category: string, count: number, total: number) =>
      `${category}: ${count} of ${plural(total, "paragraph")}`,
    goToNext: (description: string) => `${description}. Go to the next one`,
    lowConfidence: (n: number) => plural(n, "low-confidence paragraph"),
  },
  categories: {
    supports: "Supports",
    "possibly-supports": "Possibly supports",
    unrelated: "Unrelated",
    "possibly-refutes": "Possibly refutes",
    refutes: "Refutes",
    failed: "Failed",
  } satisfies Record<Category, string>,
  passage: {
    label: "Paragraph result",
    page: (page: number) => `p. ${page}`,
    paragraph: (n: number) => `¶ ${n}`,
    confidence: "Confidence",
    lowConfidence: "Low confidence",
  },
  document: {
    loading: "Loading…",
    fileUnavailable: "The original file of this paper is not available.",
    unsupported: "This type of file cannot be shown.",
    paperError: (error: string) => `The paper could not be shown: ${error}`,
    textError: (error: string) => `The document could not be shown: ${error}`,
    pageError: (page: number, error: string) =>
      `Page ${page} could not be drawn: ${error}`,
  },
  errors: {
    noApiKey: "No TypeSafe API key is configured. Add one in Settings.",
    unsupportedFileType: (extensions: readonly string[]) =>
      `Unsupported file type; expected ${extensions.slice(0, -1).join(", ")} or ${extensions.at(-1)}`,
    missingAnswer:
      "The model's response is missing an answer for one of the claims.",
    notJson: (name: string) => `${name} is not a valid JSON file.`,
    notResultsFile: (name: string) =>
      `${name} is not a ref-a-claim results file.`,
    malformedResultsFile: (name: string) =>
      `${name} is malformed and cannot be opened.`,
    originalFileUnavailable: (path: string) =>
      `The original file of ${path} is no longer available.`,
    demoUnavailable: (status: number) =>
      `The demo could not be loaded (HTTP ${status}).`,
  },
};

export type Messages = typeof en;
