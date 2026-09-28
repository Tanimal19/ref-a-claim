import { useEffect, useId, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent, type ToggleEvent } from "react";
import { describeError, useMessages } from "../i18n/index.tsx";
import { SUPPORTED_EXTENSIONS, type ParseFailure, type ParsedDocument, type PickedFile } from "../types.ts";

interface Props {
  documents: ParsedDocument[];
  failures: ParseFailure[];
  reading: boolean;
  readError?: string;
  disabled: boolean;
  onFiles: (files: PickedFile[]) => void;
  onRemove: (documentId: string) => void;
  onClear: () => void;
}

export function DocumentPicker(props: Props) {
  const { documents, failures, readError, disabled } = props;
  const m = useMessages();
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [menuPosition, setMenuPosition] = useState<CSSProperties>();
  const [dragging, setDragging] = useState(false);
  const [walkingDrop, setWalkingDrop] = useState(false);
  const [dropError, setDropError] = useState<unknown>();
  const reading = props.reading || walkingDrop;
  const busy = disabled || reading;

  // `webkitdirectory` is not a React-typed attribute, so it is set on the element directly.
  useEffect(() => {
    if (folderInputRef.current) folderInputRef.current.webkitdirectory = true;
  }, []);

  // A popover opens in the top layer, detached from the button, so it is placed under the button just before it opens.
  function handleMenuToggle(event: ToggleEvent<HTMLDivElement>) {
    const button = buttonRef.current;
    if (event.newState !== "open" || !button) return;
    const rect = button.getBoundingClientRect();
    setMenuPosition({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
  }

  function pick(input: HTMLInputElement | null) {
    menuRef.current?.hidePopover();
    input?.click();
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? [], (file) => ({ file, path: file.webkitRelativePath || file.name }));
    event.target.value = "";
    addPicked(picked);
  }

  function addPicked(picked: PickedFile[]) {
    setDropError(undefined);
    const files = picked.filter(isSupportedFile);
    if (files.length > 0) props.onFiles(files);
  }

  // Without `preventDefault` on dragover the drop never fires and the browser opens the dropped file instead.
  function handleDragOver(event: DragEvent) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = busy ? "none" : "copy";
    setDragging(!busy);
  }

  function handleDragLeave(event: DragEvent) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
  }

  async function handleDrop(event: DragEvent) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    // The drop's items are only readable during the event, so the entries are taken before anything is awaited.
    const entries = Array.from(event.dataTransfer.items).flatMap((item) => item.webkitGetAsEntry() ?? []);
    setWalkingDrop(true);
    try {
      addPicked(await droppedFiles(entries));
    } catch (error) {
      setDropError(error);
    } finally {
      setWalkingDrop(false);
    }
  }

  return (
    <section
      className={dragging ? "panel drop-target" : "panel"}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(event) => void handleDrop(event)}
    >
      <div className="panel-header">
        <span className="panel-title">{m.documents.title}</span>
        <div className="panel-buttons">
          <button ref={buttonRef} type="button" disabled={busy} popoverTarget={menuId}>
            {reading ? m.documents.reading : m.documents.chooseFiles}
          </button>
          {documents.length > 0 && (
            <button type="button" disabled={busy} onClick={props.onClear}>
              {m.documents.clear}
            </button>
          )}
        </div>
        <div
          ref={menuRef}
          id={menuId}
          popover="auto"
          className="menu compact"
          style={menuPosition}
          onBeforeToggle={handleMenuToggle}
        >
          <button type="button" className="menu-item" onClick={() => pick(filesInputRef.current)}>
            {m.documents.pickFiles}
          </button>
          <button type="button" className="menu-item" onClick={() => pick(folderInputRef.current)}>
            {m.documents.pickFolder}
          </button>
        </div>
        <input
          ref={filesInputRef}
          type="file"
          multiple
          accept={SUPPORTED_EXTENSIONS.join(",")}
          hidden
          onChange={handleChange}
        />
        <input ref={folderInputRef} type="file" multiple hidden onChange={handleChange} />
      </div>
      <p className="hint">{m.documents.hint(SUPPORTED_EXTENSIONS)}</p>

      {readError && <p className="error">{readError}</p>}
      {dropError !== undefined && <p className="error">{describeError(dropError, m)}</p>}

      {documents.length > 0 && (
        <ul className="document-list">
          {documents.map((doc) => (
            <li key={doc.id}>
              <span className="path">{doc.path}</span>
              <span className="muted">{m.documents.paragraphs(doc.passages.length)}</span>
              <button
                type="button"
                className="link"
                disabled={disabled}
                onClick={() => props.onRemove(doc.id)}
                aria-label={m.documents.removeLabel(doc.path)}
              >
                {m.documents.remove}
              </button>
            </li>
          ))}
        </ul>
      )}

      {failures.length > 0 && (
        <ul className="document-list failures">
          {failures.map((failure) => (
            <li key={failure.path}>
              <span className="path">{failure.path}</span>
              <span className="error">{describeError(failure.error, m)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function isSupportedFile({ path }: PickedFile): boolean {
  const hidden = path.split("/").some((segment) => segment.startsWith("."));
  return !hidden && SUPPORTED_EXTENSIONS.some((ext) => path.toLowerCase().endsWith(ext));
}

/** The files among dropped entries, folders walked into, each with its path from the drop (as a folder picker gives). */
async function droppedFiles(entries: readonly FileSystemEntry[]): Promise<PickedFile[]> {
  const nested = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith("."))
      .map(async (entry): Promise<PickedFile[]> => {
        if (isFileEntry(entry)) {
          const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
          return [{ file, path: entry.fullPath.replace(/^\//, "") }];
        }
        return isDirectoryEntry(entry) ? droppedFiles(await directoryEntries(entry)) : [];
      }),
  );
  return nested.flat();
}

/** `readEntries` hands a directory's entries over in batches until it returns an empty one. */
async function directoryEntries(directory: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = directory.createReader();
  const entries: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) return entries;
    entries.push(...batch);
  }
}

function isFileEntry(entry: FileSystemEntry): entry is FileSystemFileEntry {
  return entry.isFile;
}

function isDirectoryEntry(entry: FileSystemEntry): entry is FileSystemDirectoryEntry {
  return entry.isDirectory;
}
