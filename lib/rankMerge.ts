import type { DisplayHole, MissingTransition, RankedHole } from "./machine";

function pairKey(hole: MissingTransition): string {
  return `${hole.stateId}\u0000${hole.eventId}`;
}

function clampRelevance(relevance: number): number {
  return Math.min(1, Math.max(0, relevance));
}

/**
 * Applies untrusted model ranking metadata to the authoritative graph-derived
 * hole set. A model can influence ordering metadata only; it can never create
 * or remove a Structural Gap.
 */
export function mergeRanks(
  authoritative: MissingTransition[],
  ranked: RankedHole[],
  validStateIds: Set<string>,
): DisplayHole[] {
  const authoritativeKeys = new Set(authoritative.map(pairKey));
  const firstRankByKey = new Map<string, RankedHole>();

  for (const candidate of ranked) {
    const key = pairKey(candidate);
    if (!authoritativeKeys.has(key) || firstRankByKey.has(key)) continue;
    firstRankByKey.set(key, {
      ...candidate,
      relevance: clampRelevance(candidate.relevance),
      suggestedTargetStateId:
        candidate.suggestedTargetStateId !== null &&
        !validStateIds.has(candidate.suggestedTargetStateId)
          ? null
          : candidate.suggestedTargetStateId,
    });
  }

  return authoritative.map((hole) => ({
    ...hole,
    rank: firstRankByKey.get(pairKey(hole)) ?? null,
  }));
}
