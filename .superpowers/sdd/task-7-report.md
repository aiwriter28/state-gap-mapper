# Task 7 Report: rank operation and full gap UI

## Delivered

- Added the `rank` API operation with strict rank schema and prompt, server-side machine and numbered-sentence validation, deterministic hole recomputation, first-100 truncation, semantic repair, and terminal structural validation failures.
- The exact successful rank DTO is `{ kind, rankedHoles, suggestedEvents, truncated, droppedSuggestions }`. Suggested Event IDs colliding with any machine state or event ID are removed and counted.
- Added `mergeRanks`, which retains only the exact graph-derived hole set, keeps the first duplicate rank, clamps Relevance, and nulls invalid suggested targets.
- Added strict rank decoding to the browser client and nonblocking rank orchestration in the store. Extraction displays the graph and Structural Gaps before ranking completes; rank failures preserve unranked gaps with a rank-only error. Session, rank, and machine revision guards discard stale results.
- Rebuilt the gap panel around all three Structural Gap categories, Re-rank, truncation/error states, relevance/rationale, evidence chips for structural state cards, and amber dashed Suggested Event cards.

## Verification

- `npm test` passed: 9 files, 160 tests.
- `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` passed.
- Browser visual check at 1536x1024 confirmed no document or body horizontal overflow. The available browser surface exposed no network interception capability, so no live model request or API key was used; deferred success and network-failure behavior are covered by store tests.

## Review fixes

- A rank response that returns after an in-session machine edit now recomputes current gaps and merges metadata only into surviving authoritative pairs. Pre-edit Suggested Events and truncation metadata are cleared rather than carried into the revised machine.
- A `not_spec` extraction that preserves a prior machine no longer starts an unrelated rank request for that prior machine.
- The gap header now counts Missing Transitions plus the union of unreachable and dead-end state IDs, so a state in both structural categories is not double-counted.
- Added deferred regressions for rank-after-edit and same-session out-of-order Re-rank handling. The post-review full suite passes 162 tests.
