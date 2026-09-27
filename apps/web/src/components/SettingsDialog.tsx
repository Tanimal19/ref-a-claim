import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { listModels } from "../jev.ts";
import { DEFAULT_MODEL } from "../settings.ts";
import {
  CONTEXT_PARAGRAPHS_MAX,
  PASSAGE_MAX_CHARS_MAX,
  PASSAGE_MAX_CHARS_MIN,
  type ModelInfo,
  type Settings,
} from "../types.ts";

interface Props {
  open: boolean;
  settings: Settings;
  /** Loaded documents, and how many of them can be read again because their files are still at hand. */
  documentCount: number;
  resplittableCount: number;
  onClose: () => void;
  onSaved: (settings: Settings) => void;
}

export function SettingsDialog(props: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (props.open && !dialog.open) dialog.showModal();
    if (!props.open && dialog.open) dialog.close();
  }, [props.open]);

  return (
    <dialog ref={dialogRef} className="settings-dialog" aria-labelledby="settings-title" onClose={props.onClose}>
      {props.open && <SettingsForm {...props} />}
    </dialog>
  );
}

function SettingsForm({ settings, documentCount, resplittableCount, onClose, onSaved }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [removeKey, setRemoveKey] = useState(false);
  const [model, setModel] = useState(settings.model);
  const [passageMaxChars, setPassageMaxChars] = useState(String(settings.passageMaxChars));
  const [contextParagraphs, setContextParagraphs] = useState(settings.contextParagraphs);
  const [contextHeading, setContextHeading] = useState(settings.contextHeading);
  const [models, setModels] = useState<ModelInfo[]>();
  const [modelsError, setModelsError] = useState<string>();
  const modelListId = useId();

  useEffect(() => {
    if (settings.apiKey === undefined) return;
    const controller = new AbortController();
    listModels(settings.apiKey, controller.signal).then(setModels, (reason: unknown) => {
      if (!controller.signal.aborted) setModelsError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => controller.abort();
  }, [settings.apiKey]);

  const maxChars = Number(passageMaxChars);
  const maxCharsValid = Number.isInteger(maxChars) && maxChars >= PASSAGE_MAX_CHARS_MIN && maxChars <= PASSAGE_MAX_CHARS_MAX;
  const maxCharsChanged = maxCharsValid && maxChars !== settings.passageMaxChars;
  const resplits = maxCharsChanged && resplittableCount > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!maxCharsValid) return;
    const nextKey = removeKey ? undefined : apiKey.trim() || settings.apiKey;
    onSaved({
      ...(nextKey === undefined ? {} : { apiKey: nextKey }),
      model: model.trim(),
      passageMaxChars: maxChars,
      contextParagraphs,
      contextHeading,
    });
  }

  return (
    <form className="dialog-body" onSubmit={submit}>
      <h2 id="settings-title">Settings</h2>

      <fieldset>
        <legend>TypeSafe API</legend>
        <label className="field">
          <span className="field-label">API key</span>
          <input
            type="password"
            autoComplete="off"
            placeholder={settings.apiKey === undefined ? "Paste your key" : "Enter a new key to replace it"}
            value={apiKey}
            disabled={removeKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </label>
        <p className="field-hint">
          {settings.apiKey === undefined && "No key yet. Get one at console.typesafe.ai/keys."}
          {settings.apiKey !== undefined && (
            <>
              {removeKey ? "The saved key will be removed" : <>Using the saved key (…{settings.apiKey.slice(-4)}).</>}{" "}
              <button type="button" className="link" onClick={() => setRemoveKey(!removeKey)}>
                {removeKey ? "Keep it" : "Remove"}
              </button>
            </>
          )}
        </p>
        <p className="field-hint">
          Your key stays in this browser tab and is cleared when the tab closes. Requests go to TypeSafe through this
          site’s address, which relays them without keeping anything.
        </p>

        <label className="field">
          <span className="field-label">Model</span>
          <input
            list={modelListId}
            placeholder={`Default: ${DEFAULT_MODEL}`}
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
          <datalist id={modelListId}>
            {models?.map((m) => (
              <option key={m.name} value={m.name}>
                {m.description}
              </option>
            ))}
          </datalist>
        </label>
        <p className="field-hint">
          Leave empty to use {DEFAULT_MODEL}.
          {modelsError && <span className="error"> Couldn’t load the model list: {modelsError}</span>}
        </p>
      </fieldset>

      <fieldset>
        <legend>Paragraphs</legend>
        <label className="field">
          <span className="field-label">Max length</span>
          <span className="input-with-unit">
            <input
              type="number"
              min={PASSAGE_MAX_CHARS_MIN}
              max={PASSAGE_MAX_CHARS_MAX}
              step={50}
              required
              value={passageMaxChars}
              onChange={(e) => setPassageMaxChars(e.target.value)}
            />
            <span className="muted">characters</span>
          </span>
        </label>
        <p className="field-hint">Longer paragraphs are split on sentence boundaries when documents are read.</p>
        {resplits && (
          <p className="notice">
            Saving re-reads {resplittableCount} loaded document{resplittableCount === 1 ? "" : "s"} with the new length
            and clears the current results.
            {documentCount > resplittableCount &&
              ` ${documentCount - resplittableCount} opened from a results file will keep their current split.`}
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend>Context sent with each paragraph</legend>
        <label className="field">
          <span className="field-label">Neighbouring paragraphs</span>
          <select value={contextParagraphs} onChange={(e) => setContextParagraphs(Number(e.target.value))}>
            {Array.from({ length: CONTEXT_PARAGRAPHS_MAX + 1 }, (_, n) => (
              <option key={n} value={n}>
                {n === 0 ? "None" : `${n} before and after`}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={contextHeading} onChange={(e) => setContextHeading(e.target.checked)} />
          Include the section heading (Markdown)
        </label>
        <p className="field-hint">
          The model reads context only to understand the paragraph; the stance is judged on the paragraph alone. More
          context costs more input tokens. Applies to the next analysis.
        </p>
      </fieldset>

      <div className="dialog-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={!maxCharsValid}>
          {resplits ? "Save and re-read" : "Save"}
        </button>
      </div>
    </form>
  );
}
