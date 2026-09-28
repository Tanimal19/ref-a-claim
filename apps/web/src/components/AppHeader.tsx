import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type ToggleEvent,
} from "react";
import { useI18n, useMessages } from "../i18n/index.tsx";
import type { ClaimView } from "../results.ts";

export interface RunSummary {
  claims: string[];
  status: "running" | "done" | "cancelled" | "failed";
  total: number;
  finished: number;
}

interface Props {
  view: "setup" | "results";
  run?: RunSummary;
  claimView: ClaimView;
  onClaimViewChange: (view: ClaimView) => void;
  onEdit: () => void;
  onBackToResults: () => void;
  onCancel: () => void;
  onOpenResults?: () => void;
  onExportResults?: () => void;
  onOpenSettings: () => void;
  /** Shown at the bottom of the ⋯ menu. */
  usage: ReactNode;
}

export function AppHeader({
  view,
  run,
  claimView,
  onClaimViewChange,
  ...props
}: Props) {
  const m = useMessages();
  return (
    <>
      <header className="app-header">
        <button type="button" className="wordmark" onClick={props.onEdit}>
          ref-a-claim
        </button>
        <span className="header-divider" aria-hidden="true" />
        <div className="header-claim">
          {view === "setup" && run && (
            <button
              type="button"
              className="link quiet"
              onClick={props.onBackToResults}
            >
              {m.header.backToResults}
            </button>
          )}
        </div>
        {run && <RunStatus run={run} onCancel={props.onCancel} />}
        <LanguageToggle />
        <MoreMenu
          onOpenResults={props.onOpenResults}
          onExportResults={props.onExportResults}
          usage={props.usage}
        />
        <button
          type="button"
          className="icon-button"
          aria-label={m.header.settings}
          title={m.header.settings}
          onClick={props.onOpenSettings}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <a
          className="icon-button"
          href="https://github.com/Tanimal19/ref-a-claim"
          target="_blank"
          rel="noreferrer"
          aria-label={m.header.github}
          title={m.header.github}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8 0 3.2.9.8 1.3 1.9 1.3 3.2 0 4.6-2.8 5.6-5.5 5.9.5.4.9 1 .9 2.2v3.3c0 .3.1.7.8.6A12 12 0 0 0 12 .3" />
          </svg>
        </a>
      </header>
      {view === "results" && run && (
        <div className="claim-bar">
          {run.claims.length === 1 ? (
            <p className="claim">{run.claims[0]}</p>
          ) : (
            <ClaimSwitch
              claims={run.claims}
              view={claimView}
              onChange={onClaimViewChange}
            />
          )}
          <button type="button" className="link quiet" onClick={props.onEdit}>
            {m.header.editClaim}
          </button>
        </div>
      )}
    </>
  );
}

interface ClaimSwitchProps {
  claims: string[];
  view: ClaimView;
  onChange: (view: ClaimView) => void;
}

/** Picks which claim the results are shown for, or all of them combined. */
function ClaimSwitch({ claims, view, onChange }: ClaimSwitchProps) {
  const m = useMessages();
  return (
    <div
      className="claim claim-switch"
      role="group"
      aria-label={m.header.showResultsFor}
    >
      <button
        type="button"
        className="claim-option"
        aria-pressed={view === "all"}
        onClick={() => onChange("all")}
      >
        <span className="claim-number">{m.header.allClaims}</span>
        <span className="claim-text muted">
          {m.header.allClaimsDescription}
        </span>
      </button>
      {claims.map((claim, i) => (
        <button
          key={i}
          type="button"
          className="claim-option"
          aria-pressed={view === i}
          onClick={() => onChange(i)}
        >
          <span className="claim-number">{i + 1}</span>
          <span className="claim-text">{claim}</span>
        </button>
      ))}
    </div>
  );
}

function RunStatus({
  run,
  onCancel,
}: {
  run: RunSummary;
  onCancel: () => void;
}) {
  const m = useMessages();
  if (run.status === "running") {
    return (
      <div className="run-status" aria-live="polite">
        <progress max={run.total} value={run.finished} />
        <span>
          {run.finished} / {run.total}
        </span>
        <button type="button" onClick={onCancel}>
          {m.header.cancel}
        </button>
      </div>
    );
  }
  return <span className="run-status">{m.header.status[run.status]}</span>;
}

/** Switches between English and Traditional Chinese, labelled in the language it switches to. */
function LanguageToggle() {
  const { locale, messages: m, setLocale } = useI18n();
  const next = locale === "en" ? "zh-TW" : "en";
  return (
    <button
      type="button"
      className="icon-button language-toggle"
      lang={next}
      title={m.header.switchLanguageTitle}
      onClick={() => setLocale(next)}
    >
      {m.header.switchLanguage}
    </button>
  );
}

interface MoreMenuProps {
  onOpenResults?: () => void;
  onExportResults?: () => void;
  usage: ReactNode;
}

function MoreMenu({ onOpenResults, onExportResults, usage }: MoreMenuProps) {
  const m = useMessages();
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>();

  // A popover opens in the top layer, detached from the button, so it is placed under the button just before it opens.
  function handleToggle(event: ToggleEvent<HTMLDivElement>) {
    const button = buttonRef.current;
    if (event.newState !== "open" || !button) return;
    const rect = button.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 6,
      right: window.innerWidth - rect.right,
    });
  }

  function run(action: () => void) {
    menuRef.current?.hidePopover();
    action();
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="icon-button"
        aria-label={m.header.more}
        title={m.header.more}
        popoverTarget={menuId}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>
      <div
        ref={menuRef}
        id={menuId}
        popover="auto"
        className="menu"
        style={position}
        onBeforeToggle={handleToggle}
      >
        <button
          type="button"
          className="menu-item"
          disabled={!onOpenResults}
          onClick={() => onOpenResults && run(onOpenResults)}
        >
          {m.header.openResults}
        </button>
        <button
          type="button"
          className="menu-item"
          disabled={!onExportResults}
          onClick={() => onExportResults && run(onExportResults)}
        >
          {m.header.exportResults}
        </button>
        <hr />
        {usage}
      </div>
    </>
  );
}
