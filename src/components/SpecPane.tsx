import { useEffect, useMemo, useRef } from "react";
import { useStore } from "zustand";

import accountSpec from "../../samples/account-signup.txt?raw";
import accountCacheData from "../../samples/cached/account-signup.json";
import documentCacheData from "../../samples/cached/document-approval.json";
import orderCacheData from "../../samples/cached/order-checkout.json";
import documentSpec from "../../samples/document-approval.txt?raw";
import orderSpec from "../../samples/order-checkout.txt?raw";
import { uncoveredSentences } from "../../lib/selectors";
import { SpecIcon } from "./Icons";
import { decodeCachedSamplePayload } from "../llmClient";
import { appStore } from "../store";

const sampleInputs = [
  { label: "order checkout", spec: orderSpec.trim(), cacheData: orderCacheData },
  { label: "document approval", spec: documentSpec.trim(), cacheData: documentCacheData },
  { label: "account signup", spec: accountSpec.trim(), cacheData: accountCacheData },
] as const;

const samples = sampleInputs.map((sample) => ({
  label: sample.label,
  spec: sample.spec,
  cache: decodeCachedSamplePayload(sample.cacheData, sample.spec),
}));

function ReplacementDialog({
  message,
  onCancel,
  onConfirm,
}: {
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    const returnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="replacement-dialog"
      aria-labelledby="replacement-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <form onSubmit={(event) => event.preventDefault()}>
        <h3 id="replacement-dialog-title">Replace your canvas edits?</h3>
        <p>{message}</p>
        <div className="dialog-actions">
          <button className="dialog-button" type="button" autoFocus onClick={onCancel}>Keep editing</button>
          <button className="dialog-button primary" type="button" onClick={onConfirm}>
            Replace and continue
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function SpecPane() {
  const draftSpec = useStore(appStore, (state) => state.draftSpec);
  const activeSpec = useStore(appStore, (state) => state.activeSpec);
  const sentences = useStore(appStore, (state) => state.sentences);
  const machine = useStore(appStore, (state) => state.machine);
  const phase = useStore(appStore, (state) => state.phase);
  const error = useStore(appStore, (state) => state.error);
  const viabilityRefusal = useStore(appStore, (state) => state.viabilityRefusal);
  const highlightedEvidence = useStore(appStore, (state) => state.highlightedEvidence);
  const replacementConfirmation = useStore(appStore, (state) => state.replacementConfirmation);
  const editorOpen = useStore(appStore, (state) => state.editorOpen);
  const setDraftSpec = useStore(appStore, (state) => state.setDraftSpec);
  const selectSample = useStore(appStore, (state) => state.selectSample);
  const extract = useStore(appStore, (state) => state.extract);
  const confirmReplacement = useStore(appStore, (state) => state.confirmReplacement);
  const cancelReplacement = useStore(appStore, (state) => state.cancelReplacement);
  const setEditorOpen = useStore(appStore, (state) => state.setEditorOpen);

  const uncovered = useMemo(() => new Set(
    machine === null
      ? sentences.map((sentence) => sentence.index)
      : uncoveredSentences(machine, sentences.length),
  ), [machine, sentences]);

  const showEditor = machine === null || editorOpen || viabilityRefusal !== null;
  const isExtracting = phase === "extracting";

  const mapSpec = async () => {
    await extract();
    const result = appStore.getState();
    if (
      result.machine !== null &&
      result.viabilityRefusal === null &&
      result.error === null &&
      result.replacementConfirmation === null
    ) {
      setEditorOpen(false);
    }
  };

  const chooseSample = (sample: (typeof samples)[number]) => {
    selectSample(sample.spec, sample.cache ?? undefined);
  };

  return (
    <section className="pane spec-pane" aria-labelledby="spec-heading">
      <h2 className="pane-header" id="spec-heading">
        <SpecIcon className="pane-icon" />
        Spec
        <button
          className="quiet-button header-action"
          type="button"
          onClick={() => {
            if (draftSpec.length === 0 && activeSpec.length > 0) setDraftSpec(activeSpec);
            setEditorOpen(true);
          }}
        >
          Edit spec
        </button>
      </h2>

      {showEditor ? (
        <div className="empty-spec">
          <h3 className="empty-title">Map a behavioral spec</h3>
          <p className="empty-copy">
            Describe states, actors, and what happens when events occur. Or start with a cached sample.
          </p>
          {viabilityRefusal !== null ? (
            <p className="inline-message" role="status">{viabilityRefusal}</p>
          ) : null}
          <textarea
            className="spec-textarea"
            aria-label="Behavioral Spec"
            name="behavioral-spec"
            value={draftSpec}
            maxLength={4_001}
            placeholder="A new order starts in Cart. When the customer checks out, it moves to Processing..."
            onChange={(event) => setDraftSpec(event.target.value)}
          />
          <button
            className="extract-button"
            type="button"
            disabled={draftSpec.trim().length === 0 || isExtracting}
            onClick={() => void mapSpec()}
          >
            {isExtracting ? "Mapping spec…" : "Map this spec"}
          </button>
          {error !== null ? (
            <p className="inline-message" role="alert">{error.message}</p>
          ) : null}
          <div className="sample-chips" aria-label="Sample specs">
            {samples.map((sample) => (
              <button className="chip" type="button" key={sample.label} onClick={() => chooseSample(sample)}>
                {sample.label}
              </button>
            ))}
          </div>
          <div className={draftSpec.length > 4_000 ? "counter over-limit" : "counter"}>
            {draftSpec.length} / 4000
          </div>
        </div>
      ) : (
        <div className="spec-content">
          <div className="sentence-list">
            {sentences.map((sentence) => {
              const selected = highlightedEvidence.includes(sentence.index);
              const isUncovered = uncovered.has(sentence.index);
              return (
                <div
                  className={`sentence${selected ? " selected" : ""}${isUncovered ? " uncovered" : ""}`}
                  key={sentence.index}
                  data-sentence={sentence.index}
                  title={isUncovered ? "This sentence did not map to any state, event, or transition." : undefined}
                >
                  <span className="sentence-number">{sentence.index}</span>
                  <span>{sentence.text}</span>
                </div>
              );
            })}
          </div>
          <div className="spec-meta">
            <div className="coverage">{sentences.length - uncovered.size} of {sentences.length} sentences mapped</div>
            <div className="sample-chips" aria-label="Sample specs">
              {samples.map((sample) => (
                <button className="chip" type="button" key={sample.label} onClick={() => chooseSample(sample)}>
                  {sample.label}
                </button>
              ))}
            </div>
            <div className="counter">{activeSpec.length} / 4000</div>
          </div>
        </div>
      )}
      {replacementConfirmation !== null ? (
        <ReplacementDialog
          message={replacementConfirmation}
          onCancel={cancelReplacement}
          onConfirm={() => void confirmReplacement()}
        />
      ) : null}
    </section>
  );
}
