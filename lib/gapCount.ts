import type { Gaps } from "./machine.js";

/** Counts missing pairs plus each structurally affected state once. */
export function gapCount(gaps: Gaps): number {
  return gaps.missingTransitions.length + new Set([
    ...gaps.unreachableStateIds,
    ...gaps.deadEndStateIds,
  ]).size;
}
