# Task 9 Report: Accept, Dismiss, Test Stubs

## RED

- Added failing tests for both exact `renderStub` templates, `acceptHole` success and stale rejection, Suggested Event collision provenance/no-op/recreation, dismissal persistence/reset/undo/stale pruning, and the Sample 3 expiry cascade.
- Added jsdom coverage for native Accept and Dismiss controls, the picker disabled state, Enter, Escape, focus wrap, dismissed Undo, exact selectable stub text, and copy success/failure feedback.
- Initial focused run failed as intended: `renderStub`, acceptance APIs, dismissal APIs, and real action buttons were absent.

## GREEN

- Added `lib/teststub.ts` with deterministic, exact Given/When/Then output.
- Added atomic Missing Transition acceptance with existing or new target states and generated stubs.
- Added Suggested Event provenance with stable collision suffixes and re-creation after deletion.
- Added session-scoped tuple dismissal, stale-id pruning, visible dismissed rows, and Undo.
- Added native GapPanel actions, keyboard picker, Suggested Event acceptance, and selectable stubs with copy feedback.

## Gates

- Focused: `npm test -- tests/teststub.test.ts tests/commands.test.ts tests/store.test.ts tests/accept-dismiss-ui.test.tsx` - 38 passed.
- Typecheck: `npm run typecheck` - passed.
- Lint: `npm run lint` - passed.
- Full test suite: `npm test` - 186 passed.
- Production build: `npm run build` - passed. Vite reports the existing over-500 kB chunk warning only.
- Diff check: `git diff --check` - passed.

## Browser

- Opened the local app and loaded the flagship sample. Mapping could not reach a rendered machine because the local model request returned `The model service returned an invalid response` before the canvas and GapPanel path appeared.
- The Task 9 browser flow is therefore deferred to the Task 11 cached-sample artifact. The same flagship path, target picker, copy feedback, and Sample 3 three-hole cascade are covered deterministically by the Task 9 store and jsdom tests.

## Self-review

- Confirmed native controls and live copy feedback; no aria-hidden action spans remain.
- Confirmed client-facing Task 9 copy uses ASCII punctuation.
- Confirmed dismissed keys survive defined-then-reappearing transitions but are pruned when either id is removed.
- Confirmed no Task 10 matrix or coverage-diff behavior was added.

## Deferrals

- Browser walkthrough awaits the cached sample payload introduced in Task 11; no API, cache, matrix, or coverage work was added here.

## Independent Review Follow-up

### RED

- Added rendered regressions for stale Missing Transition errors, Suggested Event cap errors, native Cancel activation with Enter, and new-target acceptance through exact rendered stub output.
- Added a command audit covering the 30-event cap, 10-surface-form cap, empty and normalized-duplicate surface forms, immutable input/provenance, and copied surface-form data.
- Focused RED had four intended failures: acceptance errors were invisible, Cancel Enter was intercepted as confirm, and invalid empty/duplicate Suggested Event surface forms were accepted.

### GREEN

- GapPanel now renders current command failures with `role="alert"`; picker failures remain open, Suggested Event failures appear beside their origin, and fresh actions clear stale feedback.
- Picker-level Enter confirmation now ignores button targets so native Cancel and Confirm activation remain correct while input/select Enter still confirms.
- Suggested Event acceptance now validates required, nonblank, normalized-unique, bounded surface forms before any machine change.
- Rendered new-target coverage confirms the new state, transition, and exact Test Stub.

### Follow-up gates

- Focused rendered/command suite: 18 passed.
- Typecheck: passed.
- Lint: passed.
- Full test suite: 191 passed.
- Production build: passed with the existing over-500 kB chunk warning only.
- Diff check: passed.
