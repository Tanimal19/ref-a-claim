import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { describeError, useMessages } from "../i18n/index.tsx";
import { listModels } from "../jev.ts";
import { DEFAULT_MODEL } from "../settings.ts";
import {
  CONTEXT_PARAGRAPHS_MAX,
  PASSAGE_MAX_CHARS_MAX,
  PASSAGE_MAX_CHARS_MIN,
  POSSIBLE_ABOVE_MAX,
  POSSIBLE_ABOVE_MIN,
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
  const m = useMessages();
  const [apiKey, setApiKey] = useState("");
  const [removeKey, setRemoveKey] = useState(false);
  const [model, setModel] = useState(settings.model);
  const [passageMaxChars, setPassageMaxChars] = useState(String(settings.passageMaxChars));
  const [contextParagraphs, setContextParagraphs] = useState(settings.contextParagraphs);
  const [contextHeading, setContextHeading] = useState(settings.contextHeading);
  const [possibleAbove, setPossibleAbove] = useState(String(settings.possibleAbove));
  const [models, setModels] = useState<ModelInfo[]>();
  const [modelsError, setModelsError] = useState<unknown>();
  const modelListId = useId();

  useEffect(() => {
    if (settings.apiKey === undefined) return;
    const controller = new AbortController();
    listModels(settings.apiKey, controller.signal).then(setModels, (reason: unknown) => {
      if (!controller.signal.aborted) setModelsError(reason);
    });
    return () => controller.abort();
  }, [settings.apiKey]);

  const maxChars = Number(passageMaxChars);
  const maxCharsValid = Number.isInteger(maxChars) && maxChars >= PASSAGE_MAX_CHARS_MIN && maxChars <= PASSAGE_MAX_CHARS_MAX;
  const maxCharsChanged = maxCharsValid && maxChars !== settings.passageMaxChars;
  const resplits = maxCharsChanged && resplittableCount > 0;
  const threshold = Number(possibleAbove);
  const thresholdValid =
    possibleAbove.trim() !== "" && threshold >= POSSIBLE_ABOVE_MIN && threshold <= POSSIBLE_ABOVE_MAX;
  const valid = maxCharsValid && thresholdValid;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    const nextKey = removeKey ? undefined : apiKey.trim() || settings.apiKey;
    onSaved({
      ...(nextKey === undefined ? {} : { apiKey: nextKey }),
      model: model.trim(),
      passageMaxChars: maxChars,
      contextParagraphs,
      contextHeading,
      possibleAbove: threshold,
    });
  }

  return (
    <form className="dialog-body" onSubmit={submit}>
      <h2 id="settings-title">{m.settings.title}</h2>

      <fieldset>
        <legend>{m.settings.api}</legend>
        <label className="field">
          <span className="field-label">{m.settings.apiKey}</span>
          <input
            type="password"
            autoComplete="off"
            placeholder={settings.apiKey === undefined ? m.settings.apiKeyPlaceholder : m.settings.apiKeyReplacePlaceholder}
            value={apiKey}
            disabled={removeKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </label>
        <p className="field-hint">
          {settings.apiKey === undefined && m.settings.noKey}
          {settings.apiKey !== undefined && (
            <>
              {removeKey ? m.settings.keyWillBeRemoved : m.settings.usingSavedKey(settings.apiKey.slice(-4))}{" "}
              <button type="button" className="link" onClick={() => setRemoveKey(!removeKey)}>
                {removeKey ? m.settings.keepKey : m.settings.removeKey}
              </button>
            </>
          )}
        </p>
        <p className="field-hint">{m.settings.keyStorage}</p>

        <label className="field">
          <span className="field-label">{m.settings.model}</span>
          <input
            list={modelListId}
            placeholder={m.settings.modelPlaceholder(DEFAULT_MODEL)}
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
          {m.settings.modelHint(DEFAULT_MODEL)}
          {modelsError !== undefined && (
            <span className="error"> {m.settings.modelsError(describeError(modelsError, m))}</span>
          )}
        </p>
      </fieldset>

      <fieldset>
        <legend>{m.settings.paragraphs}</legend>
        <label className="field">
          <span className="field-label">{m.settings.maxLength}</span>
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
            <span className="muted">{m.settings.characters}</span>
          </span>
        </label>
        <p className="field-hint">{m.settings.maxLengthHint}</p>
        {resplits && (
          <p className="notice">{m.settings.resplitNotice(resplittableCount, documentCount - resplittableCount)}</p>
        )}
      </fieldset>

      <fieldset>
        <legend>{m.settings.context}</legend>
        <label className="field">
          <span className="field-label">{m.settings.neighbours}</span>
          <select value={contextParagraphs} onChange={(e) => setContextParagraphs(Number(e.target.value))}>
            {Array.from({ length: CONTEXT_PARAGRAPHS_MAX + 1 }, (_, n) => (
              <option key={n} value={n}>
                {n === 0 ? m.settings.noNeighbours : m.settings.neighboursEachSide(n)}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={contextHeading} onChange={(e) => setContextHeading(e.target.checked)} />
          {m.settings.includeHeading}
        </label>
        <p className="field-hint">{m.settings.contextHint}</p>
      </fieldset>

      <fieldset>
        <legend>{m.settings.results}</legend>
        <label className="field">
          <span className="field-label">{m.settings.possibleAbove}</span>
          <input
            type="number"
            min={POSSIBLE_ABOVE_MIN}
            max={POSSIBLE_ABOVE_MAX}
            step={0.05}
            required
            value={possibleAbove}
            onChange={(e) => setPossibleAbove(e.target.value)}
          />
        </label>
        <p className="field-hint">{m.settings.possibleAboveHint(POSSIBLE_ABOVE_MIN, POSSIBLE_ABOVE_MAX)}</p>
      </fieldset>

      <div className="dialog-actions">
        <button type="button" onClick={onClose}>
          {m.settings.cancel}
        </button>
        <button type="submit" className="primary" disabled={!valid}>
          {resplits ? m.settings.saveAndReread : m.settings.save}
        </button>
      </div>
    </form>
  );
}
