import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";

import type { HoleTarget } from "../../lib/commands";
import { holeEvidence, type DisplayHole, type Machine, type MissingTransition } from "../../lib/machine";
import { GapIcon } from "./Icons";
import { appStore } from "../store";

function pairKey(hole: MissingTransition): string {
  return `${hole.stateId}\u0000${hole.eventId}`;
}

function holeFromPairKey(key: string): MissingTransition | null {
  const separator = key.indexOf("\u0000");
  if (separator < 1 || separator === key.length - 1) return null;
  return { stateId: key.slice(0, separator), eventId: key.slice(separator + 1) };
}

function relevanceLabel(relevance: number): string {
  return `${Math.round(relevance * 100)}%`;
}

function stateEvidence(machine: Machine, stateId: string): number[] {
  return machine.states.find((state) => state.id === stateId)?.evidence ?? [];
}

function AcceptPicker({
  machine,
  hole,
  onAccept,
  onClose,
  errorMessage,
}: {
  machine: Machine;
  hole: MissingTransition;
  onAccept: (target: HoleTarget) => boolean;
  onClose: () => void;
  errorMessage: string | null;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [targetKind, setTargetKind] = useState<"existing" | "new">("existing");
  const [existingStateId, setExistingStateId] = useState("");
  const [newStateName, setNewStateName] = useState("");
  const canConfirm = targetKind === "existing" ? existingStateId.length > 0 : newStateName.trim().length > 0;

  useEffect(() => {
    const first = dialogRef.current?.querySelector<HTMLElement>("input, select, button:not([disabled])");
    first?.focus();
  }, []);

  const confirm = () => {
    if (!canConfirm) return;
    const target: HoleTarget = targetKind === "existing"
      ? { kind: "existing", stateId: existingStateId }
      : { kind: "new", name: newStateName };
    if (onAccept(target)) onClose();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "Enter" && (event.target as HTMLElement).tagName !== "BUTTON") {
      event.preventDefault();
      confirm();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), select:not([disabled])",
    ) ?? [])];
    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
    if (event.shiftKey && currentIndex === 0) {
      event.preventDefault();
      focusable.at(-1)?.focus();
    } else if (!event.shiftKey && currentIndex === focusable.length - 1) {
      event.preventDefault();
      focusable[0]?.focus();
    }
  };

  return (
    <div className="accept-backdrop">
      <div
        ref={dialogRef}
        className="accept-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Accept Missing Transition"
        onKeyDown={onKeyDown}
      >
        <h3>Accept Missing Transition</h3>
        <p className="accept-picker-pair">{hole.stateId} x {hole.eventId}</p>
        <fieldset>
          <legend>Target</legend>
          <label className="picker-choice">
            <input
              type="radio"
              name="target-kind"
              checked={targetKind === "existing"}
              onChange={() => setTargetKind("existing")}
            />
            Existing state
          </label>
          <label className="picker-choice">
            <input
              type="radio"
              name="target-kind"
              checked={targetKind === "new"}
              onChange={() => setTargetKind("new")}
            />
            New state
          </label>
        </fieldset>
        {targetKind === "existing" ? (
          <label className="field-label">
            Target state
            <select
              className="field-select"
              aria-label="Target state"
              value={existingStateId}
              onChange={(event) => setExistingStateId(event.target.value)}
            >
              <option value="">Choose a state</option>
              {machine.states.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
            </select>
          </label>
        ) : (
          <label className="field-label">
            New state name
            <input
              className="field-input"
              value={newStateName}
              onChange={(event) => setNewStateName(event.target.value)}
            />
          </label>
        )}
        {errorMessage !== null ? <p className="command-feedback" role="alert">{errorMessage}</p> : null}
        <div className="dialog-actions">
          <button className="dialog-button" type="button" onClick={onClose}>Cancel</button>
          <button className="dialog-button primary" type="button" disabled={!canConfirm} onClick={confirm}>Confirm Accept</button>
        </div>
      </div>
    </div>
  );
}

function MissingTransitionCard({
  hole,
  machine,
  selected,
  onSelect,
  onAccept,
  onDismiss,
}: {
  hole: DisplayHole;
  machine: Machine;
  selected: boolean;
  onSelect: (hole: MissingTransition) => void;
  onAccept: (hole: MissingTransition) => void;
  onDismiss: (hole: MissingTransition) => void;
}) {
  const evidence = holeEvidence(machine, hole);
  const label = hole.rank === null ? "Structural / Unranked" : "Structural / Ranked";
  const rationale = hole.rank?.rationale ?? "This state does not define what happens for this event.";

  return (
    <article className={`gap-card expanded${selected ? " active" : ""}`}>
      <button className="gap-select" type="button" aria-pressed={selected} onClick={() => onSelect(hole)}>
        <p className="redline-label">{label}</p>
        <p className="pair">{hole.stateId} x {hole.eventId}</p>
        {hole.rank !== null ? <p className="rank-metric">Relevance {relevanceLabel(hole.rank.relevance)}</p> : null}
        <p className="rationale">{rationale}</p>
      </button>
      <div className="card-footer">
        {evidence.map((sentence) => <span className="evidence-chip" key={sentence}>S{sentence}</span>)}
        <div className="card-actions">
          <button className="quiet-button" type="button" onClick={() => onAccept(hole)}>Accept</button>
          <button className="quiet-button" type="button" onClick={() => onDismiss(hole)}>Dismiss</button>
        </div>
      </div>
    </article>
  );
}

function StructuralStateCard({ machine, stateId }: { machine: Machine; stateId: string }) {
  const evidence = stateEvidence(machine, stateId);
  return (
    <article className="structural-card" key={stateId}>
      <span className="structural-label">Structural</span>
      <p className="pair">{stateId}</p>
      <div className="card-footer">
        {evidence.map((sentence) => <span className="evidence-chip" key={sentence}>S{sentence}</span>)}
      </div>
    </article>
  );
}

export function GapPanel() {
  const machine = useStore(appStore, (state) => state.machine);
  const gaps = useStore(appStore, (state) => state.gaps);
  const displayHoles = useStore(appStore, (state) => state.displayHoles);
  const dismissedPairKeys = useStore(appStore, (state) => state.dismissedPairKeys);
  const selectedHoleKey = useStore(appStore, (state) => state.selectedHoleKey);
  const selectHole = useStore(appStore, (state) => state.selectHole);
  const acceptHole = useStore(appStore, (state) => state.acceptHole);
  const acceptSuggestedEvent = useStore(appStore, (state) => state.acceptSuggestedEvent);
  const dismissHole = useStore(appStore, (state) => state.dismissHole);
  const undoDismiss = useStore(appStore, (state) => state.undoDismiss);
  const commandError = useStore(appStore, (state) => state.commandError);
  const clearCommandError = useStore(appStore, (state) => state.clearCommandError);
  const rank = useStore(appStore, (state) => state.rank);
  const rankPending = useStore(appStore, (state) => state.rankPending);
  const rankError = useStore(appStore, (state) => state.rankError);
  const rankTruncated = useStore(appStore, (state) => state.rankTruncated);
  const suggestedEvents = useStore(appStore, (state) => state.suggestedEvents);
  const [acceptingHole, setAcceptingHole] = useState<MissingTransition | null>(null);
  const totalGaps = useMemo(() => (
    displayHoles.length + new Set([...gaps.unreachableStateIds, ...gaps.deadEndStateIds]).size
  ), [displayHoles.length, gaps.deadEndStateIds, gaps.unreachableStateIds]);
  const dismissedHoles = useMemo(() => {
    if (machine === null) return [];
    const stateIds = new Set(machine.states.map((state) => state.id));
    const eventIds = new Set(machine.events.map((event) => event.id));
    return [...dismissedPairKeys]
      .map(holeFromPairKey)
      .filter((hole): hole is MissingTransition => hole !== null && stateIds.has(hole.stateId) && eventIds.has(hole.eventId));
  }, [dismissedPairKeys, machine]);
  const openPicker = (hole: MissingTransition) => {
    clearCommandError();
    setAcceptingHole(hole);
  };
  const closePicker = () => {
    clearCommandError();
    setAcceptingHole(null);
  };
  const acceptSuggestion = (suggestion: Parameters<typeof acceptSuggestedEvent>[0]) => {
    clearCommandError();
    acceptSuggestedEvent(suggestion);
  };

  return (
    <section className="pane gaps-pane" aria-labelledby="gaps-heading">
      <h2 className="pane-header" id="gaps-heading">
        <GapIcon className="pane-icon" />
        Gaps ({totalGaps})
        <button className="quiet-button header-action" type="button" disabled={machine === null || rankPending} onClick={() => void rank()}>
          Re-rank
        </button>
      </h2>
      {machine === null ? (
        <div className="gap-empty">No Structural Gaps yet.<br />They will appear after a spec is mapped.</div>
      ) : (
        <div className="gap-scroll">
          {rankError !== null ? <p className="rank-message">Ranking is unavailable right now. Structural gaps are still shown.</p> : null}
          {rankTruncated ? <p className="rank-message">Ranked the first 100 holes; the rest remain listed as Unranked.</p> : null}
          {commandError !== null && acceptingHole === null ? (
            <p className="command-feedback" role="alert">{commandError.message}</p>
          ) : null}

          <h3 className="gap-section-heading">Missing Transitions</h3>
          {displayHoles.map((hole) => (
            <MissingTransitionCard
              hole={hole}
              machine={machine}
              selected={pairKey(hole) === selectedHoleKey}
              onSelect={selectHole}
              onAccept={openPicker}
              onDismiss={dismissHole}
              key={pairKey(hole)}
            />
          ))}

          {dismissedHoles.length > 0 ? (
            <>
              <div className="section-rule" />
              <h3 className="gap-section-heading">Dismissed</h3>
              {dismissedHoles.map((hole) => (
                <div className="dismissed-row" key={pairKey(hole)}>
                  <span className="pair">{hole.stateId} x {hole.eventId}</span>
                  <button className="quiet-button" type="button" onClick={() => undoDismiss(hole)}>Undo {hole.stateId} x {hole.eventId}</button>
                </div>
              ))}
            </>
          ) : null}

          <div className="section-rule" />
          <h3 className="gap-section-heading">Unreachable States</h3>
          {gaps.unreachableStateIds.map((stateId) => <StructuralStateCard machine={machine} stateId={stateId} key={stateId} />)}

          <div className="section-rule" />
          <h3 className="gap-section-heading">Dead-End States</h3>
          {gaps.deadEndStateIds.map((stateId) => <StructuralStateCard machine={machine} stateId={stateId} key={stateId} />)}

          {suggestedEvents.length > 0 ? (
            <>
              <div className="section-rule" />
              <h3 className="gap-section-heading">Suggested Events</h3>
              {suggestedEvents.map((suggestion) => (
                <article className="suggested-card" key={suggestion.id}>
                  <span className="suggested-label">Suggested</span>
                  <p className="pair">{suggestion.id}</p>
                  <p className="rank-metric">Confidence {relevanceLabel(suggestion.confidence)}</p>
                  <p className="rationale">{suggestion.rationale}</p>
                  <div className="card-actions suggested-actions">
                    <button className="quiet-button" type="button" onClick={() => acceptSuggestion(suggestion)}>Accept</button>
                  </div>
                </article>
              ))}
            </>
          ) : null}

          {displayHoles.length > 0 ? <p className="matrix-link">Show all {displayHoles.length} undefined pairs</p> : null}
        </div>
      )}
      {machine !== null && acceptingHole !== null ? (
        <AcceptPicker
          machine={machine}
          hole={acceptingHole}
          onAccept={(target) => acceptHole(acceptingHole, target).ok}
          onClose={closePicker}
          errorMessage={commandError?.message ?? null}
        />
      ) : null}
    </section>
  );
}
