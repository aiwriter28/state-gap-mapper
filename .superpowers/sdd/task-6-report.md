# Task 6 report — store, strict client, and paste-to-Structural-Gaps UI

## Outcome

Implemented the Day-1 vertical path in the Task 6 worktree:

- strict `unknown` boundary for `/api/llm` success and error DTOs;
- race-safe Zustand extraction state with separate `draftSpec` / `activeSpec`;
- approved three-pane React shell plus minimal Test Stubs drawer;
- real React Flow state/event rendering with dagre initial layout;
- deterministic Structural Gap cards and `holeEvidence` selection;
- one dashed redline ghost edge, solid while its card is selected;
- inline input refusal, loading, retryable error, and viability-refusal states;
- Sample 1 browser path: sample button → extraction → 5 states → 10 Missing Transitions.

No credential was read. `OPENAI_API_KEY` is absent, so browser runs intercepted only `/api/llm` at the pre-document `window.fetch` boundary. The real React, store, `llmClient`, decoder/validator, gap engine, and renderer paths ran unchanged.

## RED / GREEN evidence

### RED

Added `tests/llm-client.test.ts` and `tests/store.test.ts` before the implementation. The focused run failed at module import as expected:

```text
FAIL tests/llm-client.test.ts — Cannot find module '../src/llmClient'
FAIL tests/store.test.ts — Cannot find module '../src/store'
Test Files 2 failed
```

The RED cases covered strict response decoding, malformed JSON/HTML/network failures, the literal Sample 1 machine, deferred out-of-order extraction success/rejection/finally, failed/refused preservation, atomic reset, input caps, and draft/active separation.

### GREEN

The focused final run passed:

```text
Test Files 3 passed (3)
Tests 23 passed (23)
```

Focused tests now include:

- strict machine and `not_spec` success DTO decoding;
- exact-key and semantic validation before store/render;
- strict, internally consistent `ApiError` decoding;
- malformed JSON, HTML, invalid DTO, invalid machine, invalid error, and network normalization;
- Sample 1 exact 10-hole derivation and five-state flow conversion;
- A/B out-of-order success, stale rejection, and stale `finally` protection;
- current failure phase cleanup and prior-machine preservation;
- first and subsequent `not_spec` behavior;
- successful atomic reset of ranks, truncation, suggestions, stubs, dismissed pairs, selected/evidence state, viability state, and dirty state;
- 4,001-character and blank refusal without a client request;
- sample selection invalidating a pending live extraction;
- an all-final single-state layout regression (finite coordinates).

## Final gates

```text
npm run typecheck  PASS
npm test           PASS — 8 files, 144 tests
npm run lint       PASS
npm run build      PASS — 480 modules, 476.00 kB JS / 150.15 kB gzip
git diff --check   PASS
```

## Browser verification

Method: `npx vercel dev --listen 4173`, after correcting the recursive scaffold `dev` command to `vite`. Chrome DevTools used a named isolated context and a pre-document fetch interceptor for `/api/llm` only.

Viewport assertions on the empty, mapped, selected, and refused states:

```text
window.innerWidth = 1536
window.innerHeight = 1024
window.devicePixelRatio = 2
window.scrollY = 0
document.documentElement.scrollHeight = 1024
document.documentElement.clientHeight = 1024
```

Behavior results:

- empty: 0 state nodes, 0 gap cards;
- Sample 1: 5 state nodes, 10 gap cards, dashed ghost;
- selected `processing x cancel`: S2 and S5 only, solid ghost, `aria-pressed=true`;
- recipe `not_spec`: refusal shown while the prior 5 nodes and 10 gap cards remain in the DOM/store;
- delayed API fixture: exact copy `Extracting your state machine.` / `This takes a few seconds.`;
- no shell/document overflow; only pane scrolling is used.

Screenshots, all 3072×2048 physical pixels (1536×1024 CSS at DPR2):

- `design-samples/verification/task-6-empty.png`
- `design-samples/verification/task-6-loading.png`
- `design-samples/verification/task-6-mid.png`
- `design-samples/verification/task-6-selected.png`
- `design-samples/verification/task-6-refusal-preserved.png`

## Files

Created:

- `src/llmClient.ts`
- `src/store.ts`
- `src/components/Canvas.tsx`
- `src/components/flowLayout.ts`
- `src/components/GapPanel.tsx`
- `src/components/Icons.tsx`
- `src/components/SpecPane.tsx`
- `src/components/StubsPanel.tsx`
- `tests/llm-client.test.ts`
- `tests/store.test.ts`
- `tests/canvas.test.ts`
- five Task 6 verification screenshots listed above

Updated:

- `src/App.tsx`
- `src/index.css`
- `src/main.tsx`
- `index.html`
- `package.json` (`dev: vite`, allowing outer `npx vercel dev` to run without recursion)

## Self-review

### Spec and standards

- Uses the glossary terms Spec, Sentence, Evidence, Structural Gap, Missing Transition, and Unranked.
- Structural Gap existence comes only from `computeGaps`; the UI does not invent relevance, confidence, or suggested events.
- `holeEvidence` is the only Evidence composition path for gap cards and selection.
- `draftSpec` never labels an older machine; `activeSpec` is captured at submit time.

### Async correctness

- `sessionSeq` is monotonic and guards success, rejection, and `finally`.
- Sample selection bumps `sessionSeq` and ends the obsolete loading phase.
- Failed and refused extractions preserve the prior machine and session artifacts.
- `rankSeq` remains monotonic and is never reset by extraction; Task 6 introduces no rank request yet.

### Client trust boundary

- Response bodies begin as `unknown` parsed from text, not trusted `response.json()` values.
- Exact outer keys, bounded sequential Sentences, nested extraction DTO representation, machine semantics, Evidence ranges, error code, and retryability consistency are all checked before return.
- Malformed JSON/HTML/network and malformed success/error DTOs normalize to synthetic `upstream_failure` errors.

### React and code smells

- The main components remain focused; pure dagre/React Flow conversion is separated into `flowLayout.ts`.
- React Flow node/edge type maps are module constants, avoiding per-render identity churn.
- Store-derived facts are not mirrored into component state. The only local Spec state is the editor presentation toggle.
- Tests use the literal fixture, deferred promises, real decoders/validators, and real graph math rather than reproducing implementation formulas.

### Accessibility

- All non-canvas actions are native buttons; textarea has an accessible name.
- Gap cards expose keyboard Enter/Space selection and persistent `aria-pressed` state.
- Loading/refusal/error states use live status/alert semantics.
- Reduced motion disables the ghost pulse.

### Visual fidelity

- Locked Blueprint/Panel/Chalk/Faded/Redline tokens and Barlow/IBM Plex Mono fact boundary are preserved.
- Desktop pane geometry, internal scroll behavior, grid, nodes, double final outlines, event pills, evidence wash, cards, and drawer follow the approved prototype.
- Redline is used only for Structural Gaps/evidence; amber is not rendered because Suggested Events do not exist at this stage.
- The one ambient motion is the dashed ghost edge.

## Concerns / deliberate deferrals

- Rank metadata, Suggested Events, Accept/Dismiss, Test Stub generation, machine editing, matrix, and cached instant sample results remain deliberately disabled or absent for later tasks. Gap cards therefore show every current Missing Transition as Unranked.
- Google-hosted Barlow and IBM Plex Mono are linked like the approved prototype; system fallbacks remain available if font delivery is blocked.
