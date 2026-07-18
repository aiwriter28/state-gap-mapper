import { useMemo } from "react";
import { useStore } from "zustand";

import { holeEvidence, type DisplayHole, type Machine, type MissingTransition } from "../../lib/machine";
import { GapIcon } from "./Icons";
import { appStore } from "../store";

function pairKey(hole: MissingTransition): string {
  return `${hole.stateId}\u0000${hole.eventId}`;
}

function relevanceLabel(relevance: number): string {
  return `${Math.round(relevance * 100)}%`;
}

function stateEvidence(machine: Machine, stateId: string): number[] {
  return machine.states.find((state) => state.id === stateId)?.evidence ?? [];
}

function MissingTransitionCard({
  hole,
  machine,
  selected,
  onSelect,
}: {
  hole: DisplayHole;
  machine: Machine;
  selected: boolean;
  onSelect: (hole: MissingTransition) => void;
}) {
  const evidence = holeEvidence(machine, hole);
  const label = hole.rank === null ? "Structural / Unranked" : "Structural / Ranked";
  const rationale = hole.rank?.rationale ??
    "This state does not define what happens for this event.";

  const selectFromKeyboard = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(hole);
    }
  };

  return (
    <article
      className={`gap-card expanded${selected ? " active" : ""}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => onSelect(hole)}
      onKeyDown={selectFromKeyboard}
    >
      <p className="redline-label">{label}</p>
      <p className="pair">{hole.stateId} x {hole.eventId}</p>
      {hole.rank !== null ? <p className="rank-metric">Relevance {relevanceLabel(hole.rank.relevance)}</p> : null}
      <p className="rationale">{rationale}</p>
      <div className="card-footer">
        {evidence.map((sentence) => <span className="evidence-chip" key={sentence}>S{sentence}</span>)}
        <div className="card-actions" aria-hidden="true"><span>Accept</span><span>Dismiss</span></div>
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
  const selectedHoleKey = useStore(appStore, (state) => state.selectedHoleKey);
  const selectHole = useStore(appStore, (state) => state.selectHole);
  const rank = useStore(appStore, (state) => state.rank);
  const rankPending = useStore(appStore, (state) => state.rankPending);
  const rankError = useStore(appStore, (state) => state.rankError);
  const rankTruncated = useStore(appStore, (state) => state.rankTruncated);
  const suggestedEvents = useStore(appStore, (state) => state.suggestedEvents);
  const gapCount = useMemo(
    () => gaps.missingTransitions.length + gaps.unreachableStateIds.length + gaps.deadEndStateIds.length,
    [gaps],
  );

  return (
    <section className="pane gaps-pane" aria-labelledby="gaps-heading">
      <h2 className="pane-header" id="gaps-heading">
        <GapIcon className="pane-icon" />
        Gaps ({gapCount})
        <button
          className="quiet-button header-action"
          type="button"
          disabled={machine === null || rankPending}
          onClick={() => void rank()}
        >
          Re-rank
        </button>
      </h2>
      {machine === null ? (
        <div className="gap-empty">No Structural Gaps yet.<br />They will appear after a spec is mapped.</div>
      ) : (
        <div className="gap-scroll">
          {rankError !== null ? (
            <p className="rank-message">Ranking is unavailable right now. Structural gaps are still shown.</p>
          ) : null}
          {rankTruncated ? (
            <p className="rank-message">Ranked the first 100 holes; the rest remain listed as Unranked.</p>
          ) : null}

          <h3 className="gap-section-heading">Missing Transitions</h3>
          {displayHoles.map((hole) => (
            <MissingTransitionCard
              hole={hole}
              machine={machine}
              selected={pairKey(hole) === selectedHoleKey}
              onSelect={selectHole}
              key={pairKey(hole)}
            />
          ))}

          <div className="section-rule" />
          <h3 className="gap-section-heading">Unreachable States</h3>
          {gaps.unreachableStateIds.map((stateId) => (
            <StructuralStateCard machine={machine} stateId={stateId} key={stateId} />
          ))}

          <div className="section-rule" />
          <h3 className="gap-section-heading">Dead-End States</h3>
          {gaps.deadEndStateIds.map((stateId) => (
            <StructuralStateCard machine={machine} stateId={stateId} key={stateId} />
          ))}

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
                </article>
              ))}
            </>
          ) : null}

          {displayHoles.length > 0 ? (
            <p className="matrix-link">Show all {displayHoles.length} undefined pairs</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
