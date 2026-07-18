# State Gap Mapper prototype interaction contract

This file maps the production implementation plan to the approved HTML prototype. It separates
visible UI contracts from backend-only invariants so the React conversion does not invent or omit
product behavior.

## Spec and extraction

| Plan contract | Prototype control or state | Production binding |
|---|---|---|
| Free Spec textarea, 4,000-character limit | `Edit spec`, textarea, live counter, `Map this spec` | `draftSpec`, `setDraftSpec`, `extract()` |
| Empty/invalid input refusal | Disabled `Map this spec` and inline counter | Client validation; no request |
| Extraction pending | `Extracting` prototype state | `phase === "extracting"` |
| Non-behavioral input | `Refusal` prototype state | `viabilityRefusal` from extract response |
| Retryable API failure | `Error` prototype state and `Retry` | `ApiError.retryable` |
| Cached samples | Three sample buttons | Static decoded cache; zero API request |
| Dirty replacement guard | Confirmation dialog | `dirty` plus session invalidation |

## Dynamic canvas

| Plan contract | Prototype control or state | Production binding |
|---|---|---|
| Machine from extraction | Live SVG graph fixture | React Flow nodes/edges derived from `machine` |
| Select and rename a state | Node double-click / `Edit machine` inspector | `renameState` command |
| Add/delete state | Inspector buttons and add-state dialog | `addState`, `deleteState` commands |
| Change initial/final status | Inspector controls with validation feedback | `setInitial`, `toggleFinal` commands |
| Add a transition | Event-picker dialog | `addTransition` command |
| Delete a transition | Inspector transition row | `deleteTransition` command |
| Add/rename event | Event picker and inspector event field | `addTransition(...new event)`, `renameEvent` |
| User provenance | `Added by you` badge | `userAdded` flag; no Evidence |
| Immediate gap refresh | Gap count and Unranked card update after fixture edits | `computeGaps(machine)` after every successful command |
| Stale async rank protection | No distinct button; visible rank result never overwrites newer edits | `sessionSeq`, `rankSeq`, captured `machineRev` |

The graph is not an image. In production React Flow receives nodes and edges derived from the
current validated `Machine`. Dagre calculates initial positions. React Flow owns drag positions;
domain commands own semantic edits. A drag changes layout only. A state/edge edit creates a new
validated Machine, increments `machineRev`, recomputes Structural Gaps synchronously, and renders
the new graph. Ranking metadata is optional decoration and cannot add, remove, or hide holes.

## Gap analysis and resolution

| Plan contract | Prototype control or state | Production binding |
|---|---|---|
| Missing Transition list | Structural Gap cards | `displayHoles` from authoritative gaps + optional ranks |
| Ranking deferred or failed | `Unranked` state, notice, `Re-rank` | Rank request; holes remain visible |
| Unreachable / Dead-End | `Structural` state sections | Deterministic graph analysis |
| Evidence and canvas selection | Flagship card highlights S2/S5; another selected card replaces the canvas ghost | `holeEvidence`, selected key, and first ranked visible fallback |
| Accept with target picker | `Accept` dialog | `acceptHole` command |
| Dismiss and restore | `Dismiss` / `Undo` | Session-scoped dismissed tuple set |
| Suggested Event cascade | `Add event` | `acceptSuggestedEvent`, then synchronous gap recompute |
| Complete matrix | Matrix dialog | Defined / n-a / dismissed / hole selector precedence |
| Manual ranking | `Re-rank` | Rank operation only; no extraction |

## Trust and Test Stubs

| Plan contract | Prototype control or state | Production binding |
|---|---|---|
| Coverage difference | `Coverage` state with an uncovered sentence | `uncoveredSentences` selector |
| Deterministic Test Stub | Test Stubs drawer | `renderStub` template, never the model |
| Clipboard feedback | `Copy`, `Copied`, exact failure guidance | Clipboard API with visible fallback |
| Reduced motion | System media-query state | CSS `prefers-reduced-motion` |

## Backend-only invariants

These do not need additional buttons, but the React/store tests must prove them: strict runtime
decoding; semantic validation; repair budget; rate limiting; stale extraction/rank rejection;
set-preserving rank merge; request-size and machine-size caps; cached-sample oracle equality; and
server-side recomputation of holes before ranking.
