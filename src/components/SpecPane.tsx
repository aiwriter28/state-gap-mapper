import { useMemo, useState } from "react";
import { useStore } from "zustand";

import accountSpec from "../../samples/account-signup.txt?raw";
import documentSpec from "../../samples/document-approval.txt?raw";
import orderSpec from "../../samples/order-checkout.txt?raw";
import { SpecIcon } from "./Icons";
import { appStore } from "../store";

const samples = [
  { label: "order checkout", spec: orderSpec.trim() },
  { label: "document approval", spec: documentSpec.trim() },
  { label: "account signup", spec: accountSpec.trim() },
] as const;

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
  const setDraftSpec = useStore(appStore, (state) => state.setDraftSpec);
  const selectSample = useStore(appStore, (state) => state.selectSample);
  const extract = useStore(appStore, (state) => state.extract);
  const confirmReplacement = useStore(appStore, (state) => state.confirmReplacement);
  const cancelReplacement = useStore(appStore, (state) => state.cancelReplacement);
  const [editing, setEditing] = useState(false);

  const covered = useMemo(() => {
    const refs = new Set<number>();
    if (machine !== null) {
      for (const state of machine.states) state.evidence.forEach((index) => refs.add(index));
      for (const event of machine.events) event.evidence.forEach((index) => refs.add(index));
      for (const transition of machine.transitions) transition.evidence.forEach((index) => refs.add(index));
    }
    return refs;
  }, [machine]);

  const showEditor = machine === null || editing || viabilityRefusal !== null;
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
      setEditing(false);
    }
  };

  const chooseSample = (spec: string) => {
    selectSample(spec);
    setEditing(true);
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
            setEditing(true);
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
              <button className="chip" type="button" key={sample.label} onClick={() => chooseSample(sample.spec)}>
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
              const uncovered = !covered.has(sentence.index);
              return (
                <div
                  className={`sentence${selected ? " selected" : ""}${uncovered ? " uncovered" : ""}`}
                  key={sentence.index}
                  data-sentence={sentence.index}
                  title={uncovered ? "This sentence did not map to any state, event, or transition." : undefined}
                >
                  <span className="sentence-number">{sentence.index}</span>
                  <span>{sentence.text}</span>
                </div>
              );
            })}
          </div>
          <div className="spec-meta">
            <div className="coverage">{covered.size} of {sentences.length} sentences mapped</div>
            <div className="sample-chips" aria-label="Sample specs">
              {samples.map((sample) => (
                <button className="chip" type="button" key={sample.label} onClick={() => chooseSample(sample.spec)}>
                  {sample.label}
                </button>
              ))}
            </div>
            <div className="counter">{activeSpec.length} / 4000</div>
          </div>
        </div>
      )}
      {replacementConfirmation !== null ? (
        <dialog className="replacement-dialog" open aria-labelledby="replacement-dialog-title">
          <form method="dialog">
            <h3 id="replacement-dialog-title">Replace your canvas edits?</h3>
            <p>{replacementConfirmation}</p>
            <div className="dialog-actions">
              <button className="dialog-button" type="button" onClick={cancelReplacement}>Keep editing</button>
              <button className="dialog-button primary" type="button" onClick={() => void confirmReplacement()}>
                Replace and continue
              </button>
            </div>
          </form>
        </dialog>
      ) : null}
    </section>
  );
}
