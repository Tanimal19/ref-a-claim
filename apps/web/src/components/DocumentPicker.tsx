import { useEffect, useRef, type ChangeEvent } from "react";
import { SUPPORTED_EXTENSIONS, type ParseFailure, type ParsedDocument } from "../types.ts";

interface Props {
  documents: ParsedDocument[];
  failures: ParseFailure[];
  reading: boolean;
  readError?: string;
  disabled: boolean;
  onFiles: (files: File[]) => void;
  onRemove: (documentId: string) => void;
  onClear: () => void;
}

export function DocumentPicker(props: Props) {
  const { documents, failures, reading, readError, disabled } = props;
  const inputRef = useRef<HTMLInputElement>(null);

  // `webkitdirectory` is not a React-typed attribute, so it is set on the element directly.
  useEffect(() => {
    if (inputRef.current) inputRef.current.webkitdirectory = true;
  }, []);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter(isSupportedFile);
    event.target.value = "";
    if (files.length > 0) props.onFiles(files);
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <span className="panel-title">Documents</span>
        <div className="panel-buttons">
          <button type="button" disabled={disabled || reading} onClick={() => inputRef.current?.click()}>
            {reading ? "Reading…" : "Choose folder"}
          </button>
          {documents.length > 0 && (
            <button type="button" disabled={disabled || reading} onClick={props.onClear}>
              Clear
            </button>
          )}
        </div>
        <input ref={inputRef} type="file" multiple hidden onChange={handleChange} />
      </div>
      <p className="hint">Reads {SUPPORTED_EXTENSIONS.join(", ")} files in the folder and its subfolders.</p>

      {readError && <p className="error">{readError}</p>}

      {documents.length > 0 && (
        <ul className="document-list">
          {documents.map((doc) => (
            <li key={doc.id}>
              <span className="path">{doc.path}</span>
              <span className="muted">
                {doc.passages.length} paragraph{doc.passages.length === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                className="link"
                disabled={disabled}
                onClick={() => props.onRemove(doc.id)}
                aria-label={`Remove ${doc.path}`}
              >
                Remove
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
              <span className="error">{failure.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function isSupportedFile(file: File): boolean {
  const path = file.webkitRelativePath || file.name;
  const hidden = path.split("/").some((segment) => segment.startsWith("."));
  return !hidden && SUPPORTED_EXTENSIONS.some((ext) => path.toLowerCase().endsWith(ext));
}
