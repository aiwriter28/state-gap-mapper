import type { DisplayHole, Gaps, Machine } from "./machine.js";

export type MatrixCellStatus = "defined" | "not-applicable" | "dismissed" | "hole";

export interface MatrixCell {
  stateId: string;
  eventId: string;
  status: MatrixCellStatus;
}

export interface MatrixRow {
  stateId: string;
  cells: MatrixCell[];
}

interface ActiveGapState {
  displayHoles: readonly DisplayHole[];
  gaps: Gaps;
}

function pairKey(stateId: string, eventId: string): string {
  return `${stateId}\u0000${eventId}`;
}

/** Returns 1-based sentence indices that no machine element cites as Evidence. */
export function uncoveredSentences(machine: Machine, sentenceCount: number): number[] {
  const covered = new Set<number>();
  const recordEvidence = (evidence: readonly number[]) => {
    for (const index of evidence) {
      if (index >= 1 && index <= sentenceCount) covered.add(index);
    }
  };

  for (const state of machine.states) recordEvidence(state.evidence);
  for (const event of machine.events) recordEvidence(event.evidence);
  for (const transition of machine.transitions) recordEvidence(transition.evidence);

  return Array.from({ length: Math.max(0, sentenceCount) }, (_, index) => index + 1)
    .filter((index) => !covered.has(index));
}

/** Counts visible Missing Transitions plus each structurally affected state once. */
export function selectActiveGapCount(state: ActiveGapState): number {
  return state.displayHoles.length + new Set([
    ...state.gaps.unreachableStateIds,
    ...state.gaps.deadEndStateIds,
  ]).size;
}

/** Builds the complete state x event matrix in machine order. */
export function stateEventMatrix(
  machine: Machine,
  dismissedPairKeys: ReadonlySet<string>,
): MatrixRow[] {
  const definedPairs = new Set(machine.transitions.map((transition) => (
    pairKey(transition.from, transition.event)
  )));

  return machine.states.map((state) => ({
    stateId: state.id,
    cells: machine.events.map((event): MatrixCell => {
      const key = pairKey(state.id, event.id);
      let status: MatrixCellStatus;
      if (definedPairs.has(key)) status = "defined";
      else if (state.isFinal) status = "not-applicable";
      else if (dismissedPairKeys.has(key)) status = "dismissed";
      else status = "hole";
      return { stateId: state.id, eventId: event.id, status };
    }),
  }));
}
