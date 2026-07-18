# Flat FSM with conditions reified as outcome events

The extraction schema is a deliberately flat state machine: states (initial/final flags), a global event set, and transitions (from, event, to), no hierarchy, no guards, no actions, no parallel regions, no counters. Conditional language in a spec ("if payment fails") is reified into distinct outcome events (`payment_failed`) rather than guarded transitions; bounded repetition ("retry up to 3 times") keeps its nuance only as free text on the transition label.

## Why

A reader who knows XState will assume guards and nesting were an oversight. They weren't: gap semantics get murky under hierarchy (is a hole in a child state the child's gap or the parent's?), nested canvas rendering costs roughly a day of the 3-day budget, and a small flat schema is what makes strict JSON-schema validation with a self-healing retry loop converge reliably. Reified outcome events also make the product better, not just simpler: every reified event adds a row to the state × event matrix, which means more detectable Missing Transitions.

## Consequences

- Specs that genuinely need parallel or nested behavior get a simplified (still useful) machine, not an error.
- Gap analysis stays pure graph math over a tiny structure, so it re-runs instantly and client-side on every canvas edit.
