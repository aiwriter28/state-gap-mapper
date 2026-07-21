import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useStore } from "zustand";

import { createProject, serializeProject, type StateGapMapperProjectV1 } from "../../lib/projectFile";
import { renderReport } from "../../lib/report";
import {
  exportFilename,
  FileTransferError,
  readImportFile,
  triggerDownload,
  type ImportCandidate,
} from "../fileTransfer";
import { appStore } from "../store";

const IMPORT_DESCRIPTION = "Supported files: .txt, .md, and .markdown Spec files up to 64 KiB, or State Gap Mapper .json project files up to 8 MiB.";

const IMPORT_ERROR_COPY: Record<Exclude<FileTransferError["code"], "invalid_project">, string> = {
  unsupported_extension: "Choose a .txt, .md, .markdown, or State Gap Mapper .json file.",
  spec_too_large: "The Spec file is too large to import.",
  project_too_large: "The project file is too large to open.",
  invalid_utf8: "This file is not valid UTF-8 text.",
  empty_spec: "The imported Spec must contain text.",
  spec_too_long: "The imported Spec must be at most 4,000 characters.",
  malformed_json: "This project file is not valid JSON.",
  wrong_format: "Choose a project downloaded from State Gap Mapper.",
  unsupported_version: "This project was created by an unsupported version of State Gap Mapper.",
  read_failed: "The file could not be read. Try selecting it again.",
};

function importErrorCopy(error: unknown): string {
  if (!(error instanceof FileTransferError)) return "The file could not be read. Try selecting it again.";
  if (error.code === "invalid_project") {
    return `This project could not be opened because ${error.path ?? "$"} ${error.reason ?? "is invalid."}`;
  }
  return IMPORT_ERROR_COPY[error.code];
}

function ImportConfirmation({
  message,
  onCancel,
  onConfirm,
}: {
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="replacement-dialog"
      aria-labelledby="import-confirmation-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <form onSubmit={(event) => event.preventDefault()}>
        <h3 id="import-confirmation-title">Replace current work?</h3>
        <p>{message}</p>
        <div className="dialog-actions">
          <button className="dialog-button" type="button" autoFocus onClick={onCancel}>Cancel</button>
          <button className="dialog-button primary" type="button" onClick={onConfirm}>Continue</button>
        </div>
      </form>
    </dialog>
  );
}

function projectSnapshot(project: StateGapMapperProjectV1): void {
  appStore.getState().hydrateProject(project);
}

function replacementMessage(candidate: ImportCandidate): string | null {
  const current = appStore.getState();
  if (candidate.kind === "spec") {
    return current.draftSpec !== current.activeSpec && candidate.text !== current.draftSpec
      ? "Importing will replace your current Spec draft. Continue?"
      : null;
  }
  return current.draftSpec.length > 0 || current.machine !== null
    ? "Opening this project will replace your current Spec, canvas, gaps, and Test Stubs. Continue?"
    : null;
}

type FeedbackSetter = Dispatch<SetStateAction<string | null>>;

function ImportControl({
  error,
  setError,
  setStatus,
}: {
  error: string | null;
  setError: FeedbackSetter;
  setStatus: FeedbackSetter;
}) {
  const importButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const importSeq = useRef(0);
  const [pending, setPending] = useState<{ seq: number; candidate: ImportCandidate; message: string } | null>(null);

  const activateImport = () => {
    importSeq.current += 1;
    setPending(null);
    inputRef.current?.click();
  };

  const applyCandidate = (candidate: ImportCandidate) => {
    if (candidate.kind === "spec") {
      appStore.getState().importSpecDraft(candidate.text);
      setStatus(`Imported ${candidate.filename}. Review the Spec, then map it.`);
    } else {
      projectSnapshot(candidate.project);
      setStatus(candidate.project.spec.draft === candidate.project.spec.active
        ? `Opened ${candidate.filename}.`
        : `Opened ${candidate.filename}. The Spec editor contains a draft that has not been mapped.`);
    }
    setError(null);
  };

  const handleFile = async (file: File | undefined) => {
    if (file === undefined) return;
    const seq = importSeq.current;
    try {
      const candidate = await readImportFile(file);
      if (seq !== importSeq.current) return;
      const message = replacementMessage(candidate);
      if (message !== null) setPending({ seq, candidate, message });
      else applyCandidate(candidate);
    } catch (caught) {
      if (seq !== importSeq.current) return;
      setError(importErrorCopy(caught));
      setStatus(null);
      importButtonRef.current?.focus();
    } finally {
      if (inputRef.current !== null) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        aria-label="Choose a Spec or State Gap Mapper project file"
        aria-describedby="import-description"
        accept=".txt,.md,.markdown,.json,text/plain,text/markdown,application/json"
        onChange={(event) => void handleFile(event.currentTarget.files?.[0])}
      />
      <button
        ref={importButtonRef}
        className="quiet-button"
        type="button"
        aria-describedby={error === null ? "import-description" : "import-description import-error"}
        onClick={activateImport}
      >
        Import
      </button>
      {pending !== null ? (
        <ImportConfirmation
          message={pending.message}
          onCancel={() => {
            setPending(null);
            importButtonRef.current?.focus();
          }}
          onConfirm={() => {
            if (pending.seq === importSeq.current) applyCandidate(pending.candidate);
            setPending(null);
            importButtonRef.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}

function buildCurrentProject(date: Date) {
  const state = appStore.getState();
  if (state.machine === null) return null;
  return createProject({
    activeSpec: state.activeSpec,
    draftSpec: state.draftSpec,
    sentences: state.sentences,
    machine: state.machine,
    dirty: state.dirty,
    ranks: state.ranks,
    suggestedEvents: state.suggestedEvents,
    rankTruncated: state.rankTruncated,
    dismissedPairKeys: state.dismissedPairKeys,
    acceptedSuggestedEventIds: state.acceptedSuggestedEventIds,
    stubs: state.stubs,
  }, date);
}

function ExportControl({ setError, setStatus }: { setError: FeedbackSetter; setStatus: FeedbackSetter }) {
  const machine = useStore(appStore, (state) => state.machine);
  const phase = useStore(appStore, (state) => state.phase);
  const rankPending = useStore(appStore, (state) => state.rankPending);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const firstExportRef = useRef<HTMLButtonElement>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const exportDisabled = machine === null || phase === "extracting" || rankPending;

  useEffect(() => {
    if (panelOpen) firstExportRef.current?.focus();
  }, [panelOpen]);

  const download = (kind: "report" | "project") => {
    const now = new Date();
    const created = buildCurrentProject(now);
    if (created === null || !created.ok) {
      setError("The current project could not be downloaded because its data is invalid.");
      setStatus(null);
      return;
    }
    try {
      const filename = exportFilename(kind, now);
      if (kind === "project") {
        const serialized = serializeProject(created.value);
        if (!serialized.ok) {
          setError("The current project could not be downloaded because its data is invalid.");
          setStatus(null);
          return;
        }
        triggerDownload(serialized.text, filename, "application/json;charset=utf-8");
      } else {
        triggerDownload(renderReport(created.value), filename, "text/markdown;charset=utf-8");
      }
      setError(null);
      setStatus(`Download started: ${filename}.`);
    } catch {
      setError("The download could not be started. Try again.");
      setStatus(null);
    }
  };

  const closePanel = (restoreFocus: boolean) => {
    setPanelOpen(false);
    if (restoreFocus) requestAnimationFrame(() => exportButtonRef.current?.focus());
  };

  return (
    <div
      className="export-disclosure"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) closePanel(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closePanel(true);
        }
      }}
    >
      <button
        ref={exportButtonRef}
        className="quiet-button"
        type="button"
        aria-expanded={panelOpen}
        aria-controls="export-actions-panel"
        onClick={() => setPanelOpen((open) => !open)}
      >
        Export
      </button>
      {panelOpen ? (
        <div className="export-panel" id="export-actions-panel">
          <button ref={firstExportRef} type="button" disabled={exportDisabled} onClick={() => download("report")}>
            Download report (.md)
          </button>
          <button type="button" disabled={exportDisabled} onClick={() => download("project")}>
            Download project (.json)
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function FileActions() {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  return (
    <div className="file-actions">
      <span className="visually-hidden" id="import-description">{IMPORT_DESCRIPTION}</span>
      <ImportControl error={error} setError={setError} setStatus={setStatus} />
      <ExportControl setError={setError} setStatus={setStatus} />
      <a
        className="quiet-button docs-button"
        href="https://github.com/aiwriter28/state-gap-mapper#readme"
        target="_blank"
        rel="noreferrer"
      >
        Docs
      </a>
      <span className="file-feedback" aria-atomic="true">
        {error !== null ? <span id="import-error" role="alert">{error}</span> : null}
        {status !== null ? <span role="status" aria-live="polite">{status}</span> : null}
      </span>
    </div>
  );
}
