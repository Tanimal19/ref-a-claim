import { useId, useRef, useState, type CSSProperties, type ReactNode, type ToggleEvent } from "react";

export interface RunSummary {
  claim: string;
  status: "running" | "done" | "cancelled" | "failed";
  total: number;
  finished: number;
}

interface Props {
  view: "setup" | "results";
  run?: RunSummary;
  onEdit: () => void;
  onBackToResults: () => void;
  onCancel: () => void;
  onOpenResults: () => void;
  onExportResults?: () => void;
  onOpenSettings: () => void;
  /** Shown at the bottom of the ⋯ menu. */
  usage: ReactNode;
}

export function AppHeader({ view, run, ...props }: Props) {
  return (
    <>
      <header className="app-header">
        <span className="wordmark">ref-a-claim</span>
        <span className="header-divider" aria-hidden="true" />
        <div className="header-claim">
          {view === "setup" && run && (
            <button type="button" className="link quiet" onClick={props.onBackToResults}>
              Back to results →
            </button>
          )}
        </div>
        {run && <RunStatus run={run} onCancel={props.onCancel} />}
        <MoreMenu onOpenResults={props.onOpenResults} onExportResults={props.onExportResults} usage={props.usage} />
        <button type="button" className="icon-button" aria-label="Settings" title="Settings" onClick={props.onOpenSettings}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </header>
      {view === "results" && run && (
        <div className="claim-bar">
          <p className="claim">{run.claim}</p>
          <button type="button" className="link quiet" onClick={props.onEdit}>
            Edit claim &amp; papers
          </button>
        </div>
      )}
    </>
  );
}

function RunStatus({ run, onCancel }: { run: RunSummary; onCancel: () => void }) {
  if (run.status === "running") {
    return (
      <div className="run-status" aria-live="polite">
        <progress max={run.total} value={run.finished} />
        <span>
          {run.finished} / {run.total}
        </span>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }
  return <span className="run-status">{STATUS_LABELS[run.status]}</span>;
}

const STATUS_LABELS: Record<Exclude<RunSummary["status"], "running">, string> = {
  done: "Done",
  cancelled: "Cancelled",
  failed: "Failed",
};

interface MoreMenuProps {
  onOpenResults: () => void;
  onExportResults?: () => void;
  usage: ReactNode;
}

function MoreMenu({ onOpenResults, onExportResults, usage }: MoreMenuProps) {
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>();

  // A popover opens in the top layer, detached from the button, so it is placed under the button just before it opens.
  function handleToggle(event: ToggleEvent<HTMLDivElement>) {
    const button = buttonRef.current;
    if (event.newState !== "open" || !button) return;
    const rect = button.getBoundingClientRect();
    setPosition({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
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
        aria-label="More"
        title="More"
        popoverTarget={menuId}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>
      <div ref={menuRef} id={menuId} popover="auto" className="menu" style={position} onBeforeToggle={handleToggle}>
        <button type="button" className="menu-item" onClick={() => run(onOpenResults)}>
          Open results…
        </button>
        <button
          type="button"
          className="menu-item"
          disabled={!onExportResults}
          onClick={() => onExportResults && run(onExportResults)}
        >
          Export results
        </button>
        <hr />
        {usage}
      </div>
    </>
  );
}
