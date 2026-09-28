import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { analyze } from "./analyze.ts";
import { AppHeader } from "./components/AppHeader.tsx";
import { DocumentPicker } from "./components/DocumentPicker.tsx";
import { ResultsView } from "./components/ResultsView.tsx";
import { SettingsDialog } from "./components/SettingsDialog.tsx";
import { EMPTY_USAGE, UsagePanel, addUsage } from "./components/UsagePanel.tsx";
import { LocalizedError, describeError, useMessages } from "./i18n/index.tsx";
import { parseDocuments } from "./parse/index.ts";
import type { ClaimView, Outcome, Reading } from "./results.ts";
import { createRunFile, downloadRunFile, readRunFile } from "./runFile.ts";
import { loadSettings, saveSettings } from "./settings.ts";
import type { ParseFailure, ParsedDocument, PickedFile, Settings, TokenUsage } from "./types.ts";

/** A results file exported from an analysis of sample papers, opened by the setup page's demo section. */
const DEMO_RESULTS_URL = `${import.meta.env.BASE_URL}demo/results.json`;

interface Run {
  claims: string[];
  total: number;
  status: "running" | "done" | "cancelled" | "failed";
  error?: unknown;
}

export function App() {
  const m = useMessages();
  const [claim, setClaim] = useState("");
  const [documents, setDocuments] = useState<ParsedDocument[]>([]);
  // The source files by document path: shown in the results, embedded in exported results, and read again when the
  // paragraph length changes.
  const [sourceFiles, setSourceFiles] = useState<ReadonlyMap<string, File>>(new Map());
  const [parseFailures, setParseFailures] = useState<ParseFailure[]>([]);
  const [readError, setReadError] = useState<unknown>();
  const [reading, setReading] = useState(false);
  const [run, setRun] = useState<Run>();
  const [outcomes, setOutcomes] = useState<ReadonlyMap<string, Outcome>>(new Map());
  const [shownDocumentId, setShownDocumentId] = useState<string>();
  const [claimView, setClaimView] = useState<ClaimView>("all");
  const [view, setView] = useState<"setup" | "results">("setup");
  const [sessionUsage, setSessionUsage] = useState<TokenUsage>(EMPTY_USAGE);
  const [resultsFileError, setResultsFileError] = useState<unknown>();
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openingDemo, setOpeningDemo] = useState(false);
  const abortRef = useRef<AbortController>(null);
  const resultsInputRef = useRef<HTMLInputElement>(null);

  const claims = useMemo(() => claimsOf(claim), [claim]);
  const running = run?.status === "running";
  const shownView = run ? view : "setup";
  const passageCount = documents.reduce((sum, doc) => sum + doc.passages.length, 0);
  const runUsage = useMemo(() => {
    let total = EMPTY_USAGE;
    for (const outcome of outcomes.values()) {
      if (outcome.kind === "result") total = addUsage(total, outcome.result.usage);
    }
    return total;
  }, [outcomes]);

  function resetResults() {
    setRun(undefined);
    setOutcomes(new Map());
    setShownDocumentId(undefined);
    setResultsFileError(undefined);
  }

  async function addFiles(files: PickedFile[], passageMaxChars = settings.passageMaxChars) {
    setReading(true);
    setReadError(undefined);
    try {
      const parsed = await parseDocuments(files, passageMaxChars);
      const replaced = new Set(parsed.documents.map((doc) => doc.path));
      const byPath = new Map(files.map(({ file, path }) => [path, file]));
      setDocuments((prev) => [...prev.filter((doc) => !replaced.has(doc.path)), ...parsed.documents]);
      setSourceFiles((prev) => {
        const next = new Map(prev);
        for (const doc of parsed.documents) {
          const file = byPath.get(doc.path);
          if (file) next.set(doc.path, file);
        }
        return next;
      });
      setParseFailures(parsed.failures);
      resetResults();
    } catch (error) {
      setReadError(error);
    } finally {
      setReading(false);
    }
  }

  function removeDocument(id: string) {
    const removed = documents.find((doc) => doc.id === id);
    setDocuments((prev) => prev.filter((doc) => doc.id !== id));
    if (removed) {
      setSourceFiles((prev) => {
        const next = new Map(prev);
        next.delete(removed.path);
        return next;
      });
    }
    resetResults();
  }

  function clearDocuments() {
    setDocuments([]);
    setSourceFiles(new Map());
    setParseFailures([]);
    resetResults();
  }

  async function startAnalysis() {
    const controller = new AbortController();
    abortRef.current = controller;
    setOutcomes(new Map());
    setShownDocumentId(undefined);
    setClaimView("all");
    setResultsFileError(undefined);
    setRun({ claims, total: passageCount, status: "running" });
    setView("results");

    const record = (passageId: string, outcome: Outcome) =>
      setOutcomes((prev) => new Map(prev).set(passageId, outcome));

    try {
      await analyze(claims, documents, settings, controller.signal, {
        onResult: (result) => {
          record(result.passageId, { kind: "result", result });
          setSessionUsage((prev) => addUsage(prev, result.usage));
        },
        onFailure: ({ passageId, error }) => record(passageId, { kind: "failure", message: describeError(error, m) }),
      });
      setRun((prev) => prev && { ...prev, status: "done" });
    } catch (error) {
      setRun((prev) =>
        prev &&
        (controller.signal.aborted
          ? { ...prev, status: "cancelled" }
          : { ...prev, status: "failed", error }),
      );
    }
  }

  async function exportResults() {
    if (!run || run.status === "running") return;
    try {
      const runFile = await createRunFile({
        claims: run.claims,
        status: run.status,
        error: run.error === undefined ? undefined : describeError(run.error, m),
        documents,
        files: sourceFiles,
        outcomes,
      });
      downloadRunFile(runFile);
      setResultsFileError(undefined);
    } catch (error) {
      setResultsFileError(error);
    }
  }

  async function openResults(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await openRunFile(file);
  }

  async function openDemo() {
    setOpeningDemo(true);
    try {
      const response = await fetch(DEMO_RESULTS_URL);
      if (!response.ok) throw new LocalizedError((m) => m.errors.demoUnavailable(response.status));
      await openRunFile(new File([await response.blob()], "demo.json", { type: "application/json" }));
    } catch (error) {
      setResultsFileError(error);
    } finally {
      setOpeningDemo(false);
    }
  }

  async function openRunFile(file: File) {
    try {
      const runFile = await readRunFile(file);
      setClaim(runFile.claims.join("\n"));
      setDocuments(runFile.documents);
      setSourceFiles(runFile.files);
      setParseFailures([]);
      setReadError(undefined);
      setOutcomes(new Map(Object.entries(runFile.outcomes)));
      setShownDocumentId(undefined);
      setClaimView("all");
      setRun({
        claims: runFile.claims,
        total: runFile.documents.reduce((sum, doc) => sum + doc.passages.length, 0),
        status: runFile.status,
        error: runFile.error,
      });
      setView("results");
      setResultsFileError(undefined);
    } catch (error) {
      setResultsFileError(error);
    }
  }

  function settingsSaved(next: Settings) {
    const passageMaxCharsChanged = next.passageMaxChars !== settings.passageMaxChars;
    saveSettings(next);
    setSettings(next);
    setSettingsOpen(false);
    const files = documents.flatMap((doc) => {
      const file = sourceFiles.get(doc.path);
      return file ? [{ file, path: doc.path }] : [];
    });
    // Re-reading replaces the passages a running analysis is still reporting on, so it waits until the run ends.
    if (passageMaxCharsChanged && files.length > 0 && !running) void addFiles(files, next.passageMaxChars);
  }

  const resultsReading: Reading = { view: claimView, possibleAbove: settings.possibleAbove };
  const errors = [resultsFileError, shownView === "results" ? run?.error : undefined]
    .map((error) => (error === undefined ? "" : describeError(error, m)))
    .filter(Boolean);

  return (
    <div className="app-shell">
      <AppHeader
        view={shownView}
        run={
          run && {
            claims: run.claims,
            status: run.status,
            total: run.total,
            finished: outcomes.size,
          }
        }
        claimView={claimView}
        onClaimViewChange={setClaimView}
        onEdit={() => setView("setup")}
        onBackToResults={() => setView("results")}
        onCancel={() => abortRef.current?.abort()}
        onOpenResults={running ? undefined : () => resultsInputRef.current?.click()}
        onExportResults={run && !running ? () => void exportResults() : undefined}
        onOpenSettings={() => setSettingsOpen(true)}
        usage={<UsagePanel run={run && runUsage} session={sessionUsage} />}
      />
      <input ref={resultsInputRef} type="file" accept=".json,application/json" hidden onChange={openResults} />

      {errors.map((error) => (
        <p key={error} className="banner error" role="alert">
          {error}
        </p>
      ))}

      {shownView === "results" ? (
        <ResultsView
          claims={run?.claims ?? []}
          reading={resultsReading}
          documents={documents}
          outcomes={outcomes}
          files={sourceFiles}
          documentId={shownDocumentId}
          onDocumentChange={setShownDocumentId}
        />
      ) : (
        <div className="setup-scroll">
          <main className="setup">
            <div className="setup-intro">
              <h1>{m.setup.title}</h1>
              <p className="muted">{m.setup.subtitle}</p>
            </div>

            <section className="panel demo">
              <div>
                <span className="panel-title">{m.demo.title}</span>
                <p className="hint">{m.demo.description}</p>
              </div>
              <button type="button" disabled={running || openingDemo} onClick={() => void openDemo()}>
                {openingDemo ? m.demo.opening : m.demo.open}
              </button>
            </section>

            {settings.apiKey === undefined && (
              <p className="notice">
                {m.setup.noApiKey}{" "}
                <button type="button" className="link" onClick={() => setSettingsOpen(true)}>
                  {m.setup.openSettings}
                </button>
              </p>
            )}

            <section className="panel">
              <label htmlFor="claim" className="panel-title">
                {m.setup.claim}
              </label>
              <textarea
                id="claim"
                rows={4}
                aria-describedby="claim-hint"
                placeholder={m.setup.claimPlaceholder}
                value={claim}
                onChange={(e) => setClaim(e.target.value)}
              />
              <p id="claim-hint" className="hint">
                {m.setup.claimHint}
              </p>
            </section>

            <DocumentPicker
              documents={documents}
              failures={parseFailures}
              reading={reading}
              readError={readError === undefined ? undefined : describeError(readError, m)}
              disabled={running}
              onFiles={addFiles}
              onRemove={removeDocument}
              onClear={clearDocuments}
            />

            <div className="setup-actions">
              <button
                type="button"
                className="primary"
                disabled={running || claims.length === 0 || passageCount === 0 || reading}
                onClick={startAnalysis}
              >
                {m.setup.analyze(passageCount)}
              </button>
            </div>
          </main>
        </div>
      )}

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        documentCount={documents.length}
        resplittableCount={running ? 0 : documents.filter((doc) => sourceFiles.has(doc.path)).length}
        onClose={() => setSettingsOpen(false)}
        onSaved={settingsSaved}
      />
    </div>
  );
}

/** Each non-blank line is one claim. */
function claimsOf(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}
