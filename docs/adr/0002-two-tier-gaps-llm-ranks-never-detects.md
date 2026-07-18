# Two-tier gap model: the LLM ranks structural gaps but never detects them

Gaps come in two tiers. Structural Gaps (Missing Transitions, Unreachable States, Dead-End States) are computed by deterministic graph analysis over the extracted machine; the LLM's only role there is assigning a Relevance rank plus a one-line rationale to each undefined state/event pair, which orders the gap list but can never add or hide a hole (the complete matrix stays one click away). Suggested Events are the LLM-creative tier, events the spec never mentions, carrying a Confidence score and rendered visually distinct from Structural Gaps.

## Why

The single-list alternative (ask the LLM "what gaps does this spec have?") is simpler but fatal: it invents plausible-sounding findings, and one invented finding in front of a technical judge destroys trust in every real one. Splitting existence (deterministic, always honest) from prioritization (LLM, worst case a bad sort order) means the tool can be wrong about *ordering* but never about *facts*. This is the spec-linter positioning made mechanical.

## Consequences

- Demo specs must be seeded so the flagship gap is a Tier-1 fact (e.g., `cancel` handled in one state, absent in `processing`), not a Tier-2 suggestion.
- Two different uncertainty words in the UI, kept distinct on purpose: Relevance (does this hole matter) vs Confidence (does this event belong at all).
- Accepting a Suggested Event feeds Tier 1: the new event adds matrix rows, and structural analysis re-runs to surface its holes.
