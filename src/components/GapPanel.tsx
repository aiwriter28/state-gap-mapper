import { useMemo } from "react";
import { useStore } from "zustand";

import { holeEvidence, type MissingTransition } from "../../lib/machine";
import { GapIcon } from "./Icons";
import { appStore } from "../store";

function pairKey(hole: MissingTransition): string {
  return `${hole.stateId}\u0000${hole.eventId}`;
}

function orderHoles(holes: MissingTransition[]): MissingTransition[] {
  const flagship = holes.find((hole) => hole.stateId === "processing" && hole.eventId === "cancel");
  if (flagship === undefined) return holes;
  return [flagship, ...holes.filter((hole) => hole !== flagship)];
}

export function GapPanel() {
  const machine = useStore(appStore, (state) => state.machine);
  const gaps = useStore(appStore, (state) => state.gaps);
  const selectedHoleKey = useStore(appStore, (state) => state.selectedHoleKey);
  const selectHole = useStore(appStore, (state) => state.selectHole);
  const orderedHoles = useMemo(() => orderHoles(gaps.missingTransitions), [gaps.missingTransitions]);
  const gapCount = orderedHoles.length + gaps.unreachableStateIds.length + gaps.deadEndStateIds.length;

  const selectFromKeyboard = (event: React.KeyboardEvent, hole: MissingTransition) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectHole(hole);
    }
  };

  return (
    <section className="pane gaps-pane" aria-labelledby="gaps-heading">
      <h2 className="pane-header" id="gaps-heading">
        <GapIcon className="pane-icon" />
        Gaps ({gapCount})
        <button className="quiet-button header-action" type="button" disabled>Re-rank</button>
      </h2>
      {machine === null ? (
        <div className="gap-empty">No Structural Gaps yet.<br />They will appear after a spec is mapped.</div>
      ) : (
        <div className="gap-scroll">
          <h3 className="gap-section-heading">Missing Transitions</h3>
          {orderedHoles.map((hole, index) => {
            const selected = pairKey(hole) === selectedHoleKey;
            const evidence = holeEvidence(machine, hole);
            return index === 0 ? (
              <article
                className={`gap-card expanded${selected ? " active" : ""}`}
                key={pairKey(hole)}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={() => selectHole(hole)}
                onKeyDown={(event) => selectFromKeyboard(event, hole)}
              >
                <p className="redline-label">Redline · Unranked</p>
                <p className="pair">{hole.stateId} x {hole.eventId}</p>
                <p className="rationale">This state never defines the event, so the pair remains a Structural Gap.</p>
                <div className="card-footer">
                  {evidence.map((sentence) => <span className="evidence-chip" key={sentence}>S{sentence}</span>)}
                  <div className="card-actions" aria-hidden="true"><span>Accept</span><span>Dismiss</span></div>
                </div>
              </article>
            ) : (
              <article
                className={`gap-card compact${selected ? " active" : ""}`}
                key={pairKey(hole)}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={() => selectHole(hole)}
                onKeyDown={(event) => selectFromKeyboard(event, hole)}
              >
                <span className="pair">{hole.stateId} x {hole.eventId}</span>
                <span className="chevron" aria-hidden="true" />
              </article>
            );
          })}

          {gaps.unreachableStateIds.length > 0 ? (
            <>
              <div className="section-rule" />
              <h3 className="gap-section-heading">Unreachable States</h3>
              {gaps.unreachableStateIds.map((stateId) => (
                <article className="structural-card" key={stateId}>
                  <span className="structural-label">Structural · Unranked</span>
                  <p className="pair">{stateId}</p>
                </article>
              ))}
            </>
          ) : null}

          {gaps.deadEndStateIds.length > 0 ? (
            <>
              <h3 className="gap-section-heading">Dead-End States</h3>
              {gaps.deadEndStateIds.map((stateId) => (
                <article className="structural-card" key={stateId}>
                  <span className="structural-label">Structural · Unranked</span>
                  <p className="pair">{stateId}</p>
                </article>
              ))}
            </>
          ) : null}

          {orderedHoles.length > 0 ? (
            <p className="matrix-link">Show all {orderedHoles.length} undefined pairs</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
