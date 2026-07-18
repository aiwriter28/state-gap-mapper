# State Gap Mapper Implementation Plan (rev 5: frontend-first design gate added; rev-4 engineering contracts unchanged)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Executor note (overrides the usual full-code rule):** this plan is executed inside ONE clean
> Codex + GPT-5.6 session (hackathon rule: the Session ID must cover the majority of core
> functionality, and Codex use is 25% of the score). The plan is complete on CONTRACTS: file
> map, exact types, JSON schemas, test cases with hand-derived expected values, commands, and
> acceptance criteria. Implementation bodies are deliberately left to Codex. Test code and
> expected strings shown in steps are authoritative and must be used as written.

**Goal:** Ship State Gap Mapper (spec linter: plain-English spec in, interactive state-machine canvas out, with deterministically detected gaps, evidence links, and generated test stubs) deployed on Vercel and submitted to OpenAI Build Week (Dev Tools track) before Jul 21, 5:00pm PT.

**Architecture:** Client-heavy Vite + React SPA. ONE Vercel serverless function (`api/llm.ts`, op-discriminated) proxies both GPT-5.6 structured-output calls, so the rate limiter genuinely spans both operations within a warm instance. Call 1 returns viability + machine only (fastest first canvas); call 2 returns relevance ranking, accept targets, and Suggested Events, all non-blocking (see DESIGN_DECISIONS second amendment). Everything else (sentence splitting, runtime decoding, validation, gap analysis, rank merge, evidence composition, test stubs, coverage diff) is deterministic TypeScript. All untrusted input (model output, HTTP bodies, cached JSON) passes runtime decoders from `unknown` before semantic validation. Canvas edits route through validated domain commands and re-run gap analysis instantly with no LLM call.

**Tech Stack:** TypeScript (strict), Vite, React (version installed by current create-vite; @xyflow/react v12 supports it), dagre, zustand, Vitest, ESLint, OpenAI SDK (server-side only, model `gpt-5.6-sol`, reasoning effort `medium`, structured outputs strict mode, `maxRetries: 0`), Vercel (static + one `api/` Node function, `maxDuration: 60`), `vercel` CLI as a pinned devDependency, `engines.node: ">=20.19"`.

## Global Constraints

- Deadline: submission complete by **Jul 21, 5:00pm PT**. Judges test the live app free through Aug 5.
- Entire core build in ONE Codex + GPT-5.6 session; capture the Session ID; never paste product code from outside sources into the session.
- Decision docs are binding: `CONTEXT.md`, `DESIGN_DECISIONS.md` (incl. both 2026-07-18 amendments), ADRs 0001-0003. Call 1 = viability + machine; call 2 = ranking + targets + Suggested Events; canvas and Structural Gaps never wait on call 2.
- Vocabulary in all UI copy: `Relevance` on Missing Transitions, `Confidence` on Suggested Events, `Dismiss`, `Test Stub`. Suggested Events render visually distinct from Structural Gaps, with a text label, never color alone.
- No DB, no auth. `OPENAI_API_KEY` only in Vercel env / `.env.local` (gitignored); `.env.example` committed (gitignore contains `!.env.example`).
- Spec input cap: 4,000 characters, enforced client side (counter, submit refusal tested at store level) AND server side (400 `too_long`, tested).
- After every task: `npm run typecheck && npm test && npm run lint` must pass; commit per task.
- Client copy style: no em dashes, no words in quotation marks; plain sentences.
- All model output, request bodies, and cached JSON are decoded from `unknown` (strict DTOs, unexpected fields rejected, bounded sizes) before semantic validation; never render or cache unvalidated data.
- Deliberate deviations (documented, do not re-open): no streamed partial structured output; full keyboard-driven canvas graph drawing out of scope (node inspector is the pointer-free fallback; all non-canvas surfaces fully keyboard operable); the rate limiter is best-effort per warm instance of the single function and is verified by handler tests, not against production scaling.

---

## File Structure

```
state-gap-mapper/
├── index.html, vite.config.ts, tsconfig.json, package.json, vercel.json
├── .env.example                      # OPENAI_API_KEY=
├── design-samples/
│   ├── state-gap-mapper.html         # approved live-DOM/SVG visual and interaction contract
│   ├── qa-prototype.cjs              # Playwright visual/interaction gate
│   ├── interaction-contract.md       # plan-to-control map + dynamic-canvas binding contract
│   └── verification/                 # target-view screenshots + QA report
├── api/
│   └── llm.ts                        # POST /api/llm  {op:"extract"|"rank", ...} single function:
│                                     # shared limiter is real within a warm instance
├── lib/                              # shared by api/ and src/ (no React imports)
│   ├── machine.ts                    # domain types + holeEvidence()
│   ├── sentences.ts                  # splitSpec()
│   ├── decode.ts                     # runtime decoders from unknown (DTOs, bounds, no extra fields)
│   ├── validate.ts                   # semantic validators (structured error codes)
│   ├── gaps.ts                       # structural gap engine (authoritative)
│   ├── commands.ts                   # pure machine mutation commands (validated, discriminated args)
│   ├── rankMerge.ts                  # mergeRanks(authoritative, ranked, validStateIds)
│   ├── teststub.ts                   # Gherkin template
│   ├── errors.ts                     # ApiError contract
│   ├── budget.ts                     # request deadline/attempt budgeting
│   └── schemas.ts                    # JSON Schemas for both LLM ops + prompts
├── src/
│   ├── main.tsx, App.tsx, styles.css
│   ├── store.ts                      # zustand: thin orchestration; logic in lib/
│   ├── llmClient.ts                  # fetch wrapper for /api/llm
│   └── components/                   # SpecPane, Canvas, GapPanel, StubsPanel
├── samples/
│   ├── order-checkout.txt, document-approval.txt, account-signup.txt
│   └── cached/                       # pre-computed pipeline output per sample (Task 11)
├── scripts/
│   ├── cache-samples.mjs             # build-time: run both ops for the 3 samples
│   └── smoke-extract.mjs             # real-API smoke test (manual)
└── tests/                            # vitest: lib/ + api handler tests
```

## Domain contracts (used by every task; do not drift)

```ts
// lib/machine.ts
export interface MachineState { id: string; name: string; isInitial: boolean; isFinal: boolean; evidence: number[]; userAdded?: boolean }
export interface MachineEvent { id: string; name: string; surfaceForms: string[]; evidence: number[]; userAdded?: boolean }
export interface Transition { from: string; event: string; to: string; evidence: number[]; userAdded?: boolean }
export interface Machine { states: MachineState[]; events: MachineEvent[]; transitions: Transition[] }
export interface Sentence { index: number; text: string }          // 1-based, sequential from 1

export interface MissingTransition { stateId: string; eventId: string }
export interface Gaps { missingTransitions: MissingTransition[]; unreachableStateIds: string[]; deadEndStateIds: string[] }

// Ids are validated to ^[a-z0-9_]+$ (code bad_id_charset), so this key is injective:
export const holeKey = (h: MissingTransition) => `${h.stateId} ${h.eventId}`;

// Composite hole evidence, the ONLY evidence source for GapPanel and renderStub:
// sorted ascending, deduplicated union of the state's and the event's evidence.
export function holeEvidence(m: Machine, h: MissingTransition): number[]
// fixture: state evidence [4,2], event evidence [5,2] => [2,4,5]

export interface SuggestedEvent { id: string; name: string; surfaceForms: string[]; rationale: string; confidence: number } // 0..1
export interface RankedHole { stateId: string; eventId: string; relevance: number; rationale: string; suggestedTargetStateId: string | null }
export interface DisplayHole extends MissingTransition { rank: RankedHole | null }   // produced ONLY by lib/rankMerge.ts

// lib/errors.ts (not_spec is NOT an error: it is a 200 response kind)
export interface ApiError { code: "bad_request" | "too_long" | "payload_too_large" | "rate_limited" | "model_refusal" | "model_invalid" | "upstream_failure"; message: string; retryable: boolean }
// retryable is fixed per code: bad_request false, too_long false, payload_too_large false,
// rate_limited true, model_refusal false, model_invalid true, upstream_failure true (tested per code).
// Missing OPENAI_API_KEY and any unexpected internal throw normalize to 503 upstream_failure
// via a top-level catch (tested); nothing reaches a raw 500.
```

**Client boundary:** `src/llmClient.ts` decodes every response (success and error) from `unknown` before use; malformed JSON, HTML error pages, and network failures normalize to a synthetic `upstream_failure` ApiError (tested). Viability `reason` must be non-blank and ≤300 chars (validator rule `bad_rationale` reused) since it renders as the refusal copy.

Gap semantics (fixed): Missing Transition rows are every (non-final state, event) pair with no transition; final states excluded as rows; a transition FROM a final state is a validation error. Unreachable: no directed path from initial (BFS). Dead-end: non-final state with zero outgoing transitions. **All three categories are user-visible** (Task 7 UI contract): Unreachable and Dead-End states render as unranked Structural Gap cards in their own section and count toward the gap total.

**Rank-merge invariant (ADR 0002):** `mergeRanks(authoritative: MissingTransition[], ranked: RankedHole[], validStateIds: ReadonlySet<string>): DisplayHole[]` returns exactly the authoritative set (same (stateId, eventId) tuples, compared literally in tests without using holeKey): fabricated pairs dropped, duplicates first-kept, omitted pairs get `rank: null`, relevance clamped to [0,1], `suggestedTargetStateId` kept iff it is in `validStateIds` (final states ARE valid targets), else nulled.

**Server trust boundary (single function):** `api/llm.ts` reads the RAW request body itself (Web Request form or raw stream; never Vercel's lazy `request.body` parser, which throws on malformed JSON before our gates run) and gates in order: method (405) → content-type accepts `application/json` with or without parameters like `; charset=utf-8` (else 415) → raw body ≤64 KB counted in UTF-8 BYTES before parsing (413 `payload_too_large`; boundary tested at 64 KB and 64 KB+1 including a multibyte character straddling the limit) → JSON parse ourselves (400 on malformed) → runtime decode of the op envelope (400) → shared limiter, one bucket across BOTH ops, 10 req/min/IP (429; request 11 tested with zero transport calls; IP from Vercel's `x-forwarded-for` first entry, `"unknown"` bucket when absent; per-IP buckets pruned when their window expires) → op dispatch. `rank` accepts `{op:"rank", machine, sentences}` only; the machine is decoded + validated (400 on failure) and holes are recomputed server-side via `computeGaps` (caller-supplied holes do not exist in the API). Work caps: ≤30 states, ≤30 events, ≤200 transitions, ≤100 holes sent to the model (deterministic drop order, `truncated: true`; boundary tested at 100 and 101).

**Request-time budget (`lib/budget.ts`), exact formula (single reserve, no double counting):** `deadline = start + 50_000` ms (the 10s response reserve is already excluded from the 60s `maxDuration`). At each attempt: `slot = min(20_000, deadline - now)`; start the attempt only if `slot >= 15_000`, with the attempt's own timeout set to `slot`; otherwise stop immediately and return the documented ApiError for the repair-exhausted state (502 `model_invalid` if ≥1 semantic failure occurred, else 503). SDK `maxRetries: 0` (all retry logic is ours). Repair retries (max 2) apply ONLY to semantic-validation failures; refusals/timeouts/transport errors are terminal. Fake-timer tests: attempts ending near 20s/40s/55s; budget exhaustion after only two slow semantic failures still emits 502.

## Seeded sample specs (fixtures AND demo content)

**Sample 1, `samples/order-checkout.txt` (flagship demo):**
```
A new order starts in the Cart state.
When the customer checks out, the order moves from Cart to Processing while payment is attempted.
If payment succeeds, the order moves from Processing to Paid.
If payment fails, the order returns from Processing to Cart so the customer can try again.
The customer can cancel the order from the Cart, which moves it to Cancelled.
Once a Paid order is handed to the courier, it moves to Shipped.
```
Hand-derived: states `cart` (initial), `processing`, `paid`, `cancelled` (final), `shipped` (final); events `checkout` (S2), `payment_succeeded` (S3), `payment_failed` (S4), `cancel` (S5), `handed_to_courier` (S6); 5 transitions. 3 non-final states × 5 events = 15 cells, 5 defined, **10 Missing Transitions including the flagship (`processing`, `cancel`)** with `holeEvidence` = [2, 5]; natural accept target `cancelled` (a final state; must survive merge).

**Sample 2, `samples/document-approval.txt`:** states `draft` (initial), `in_review`, `approved`, `published` (final), `archived` (final); events submit, approve, request_changes, publish, archive; 10 holes; expected top-ranked (`approved`, `request_changes`).
```
A document begins as a Draft.
The author can submit a Draft for review, moving it to In Review.
A reviewer can approve the document, moving it from In Review to Approved.
A reviewer can request changes, sending the document from In Review back to Draft.
An Approved document can be published, moving it to Published.
The author can archive a Draft, moving it to Archived.
```

**Sample 3, `samples/account-signup.txt` (Suggested Events showcase):** states `unverified` (initial), `active`, `locked`, `deactivated` (final); events code_correct, code_incorrect_3x, unlock, deactivate; 8 holes. Cache criterion: the committed cached rank payload contains ≥1 Suggested Event whose id or name matches `/expir/i`; regenerate if not (curated artifact).
```
When someone signs up, their account is created in the Unverified state.
We email a verification code, and when the user enters it correctly the account becomes Active.
If the code is entered incorrectly three times, the account moves to Locked.
A support agent can unlock a Locked account, returning it to Unverified.
An Active account can be deactivated by its owner, moving it to Deactivated.
```

---

## Pre-implementation design gate (Task 0)

This gate is a design artifact, not production app code, and therefore does not dilute the
hackathon requirement that the single clean Codex implementation session contain the majority
of core functionality. Production React conversion and all product wiring remain inside that
implementation session.

**Binding visual sources, in precedence order:** `DESIGN.md`; `mockups/var-a-minimal.png` for
minimal canvas character; `mockups/hero-v2.png` for full-screen composition; component crops
for Structural Gap, accept conversion, and Test Stub anatomy.

**Files:** `design-samples/state-gap-mapper.html`, `design-samples/qa-prototype.cjs`,
`design-samples/verification/*`.

- [x] Build a standalone live HTML/CSS/SVG prototype. No screenshot is used as UI; text,
  graph nodes/edges, cards, buttons, drawers, dialogs, textarea, and matrix are live controls.
- [x] Scaffold fixture-driven empty, extraction, refusal, retryable-error, mid-session,
  selected-gap, accepted-gap, dismiss/undo, Unranked/re-rank, Unreachable/Dead-End,
  coverage-diff, editable-canvas inspector, state/transition mutation, dirty replacement,
  Suggested Event cascade, Test Stub, and matrix states.
- [x] Verify at 1536×1024 DPR 2 and 1280×800 with section screenshots, overlay screenshots,
  no shell overflow, keyboard traversal, reduced motion, and zero browser console errors.
- [x] Asset-density gate: zero raster assets in the prototype; all visual UI is DOM or SVG, so
  no intrinsic-versus-rendered density deficit exists.
- [x] Map every Task 6–12 UI requirement and dynamic-canvas behavior in
  `design-samples/interaction-contract.md`; expanded Playwright contract passes.
- [ ] User opens the served prototype in Chrome and explicitly approves the visual contract.
- [ ] Only after approval, Task 6 converts this exact structure and token set into production
  React components. Visual changes are corrected in the HTML contract first, then reconverted.

---

## Day 1 (Jul 19): deterministic core + extraction, end to end

### Task 1: Scaffold (preservation-safe, failing gates)

**Files:** project skeleton above. The directory ALREADY CONTAINS binding docs; never delete or overwrite them.

- [ ] Step 1: Hash manifest of every pre-existing file: `find . -type f -not -path './node_modules/*' -exec shasum -a 256 {} \; | sort > /tmp/pre-manifest.txt`.
- [ ] Step 2: Scaffold `npm create vite@latest sgm-tmp -- --template react-ts` in a temp subdir; merge into root WITHOUT overwriting existing files; remove `sgm-tmp`. Gate (fails the task if it fails): verify ONLY the pre-existing paths against the recorded hashes with `shasum -a 256 --check /tmp/pre-manifest.txt` (must report OK for every line; new scaffold files are outside the manifest by construction). Separate check: the intended scaffold files (`index.html`, `vite.config.ts`, `package.json`) now exist.
- [ ] Step 3: Deps `@xyflow/react dagre zustand`; dev deps `vitest eslint @types/dagre @vercel/node vercel` (vercel pinned, project-local; npm scripts use `npx vercel`); api dep `openai`. `package.json` gets `"engines": {"node": ">=20.19"}` (current Vite requirement).
- [ ] Step 4: Explicit config, none inherited blindly:
  - `tsconfig.json`: single strict config, `include` covers `src`, `api`, `lib`, `tests`; no project references (unsupported by Vercel's Node runtime). Gate: `npx tsc --noEmit --listFiles | grep -q lib/machine.ts && npx tsc --noEmit --listFiles | grep -q api/llm.ts && npx tsc --noEmit --listFiles | grep -q tests/` (each grep must succeed; run after Task 2 adds the first test file, and add a placeholder `lib/machine.ts` + `api/llm.ts` now so the gate is meaningful immediately).
  - scripts: `dev` (`npx vercel dev`), `build`, `typecheck` (`tsc --noEmit`), `test` (`vitest run --passWithNoTests`), `lint`.
  - `vercel.json`: `{"functions": {"api/llm.ts": {"maxDuration": 60}}}` plus static build.
  - `.gitignore`: `.env*` then `!.env.example`, `graphify-out/`, `node_modules/`, `dist/`, `.vercel/`.
- [ ] Step 5: `git init` (verify `git rev-parse --show-toplevel`), gate: `npx vercel build` succeeds, commit `chore: scaffold` including `.env.example` (gate: `git ls-files | grep -q .env.example`).
- [ ] Step 6: Clean-environment gate: `npm ci && npm run typecheck && npm test && npm run lint` all pass with no global CLIs assumed.

### Task 2: Sentence splitter (TDD)

**Files:** Create `lib/sentences.ts`, `tests/sentences.test.ts`, and the three `samples/*.txt` verbatim from this plan.
**Interfaces:** `splitSpec(text: string): Sentence[]` (1-based sequential from 1, trimmed, empty segments dropped). Deterministic and stable (ADR 0003).

- [ ] Step 1: Failing tests (authoritative):
```ts
import { readFileSync } from "node:fs";
import { splitSpec } from "../lib/sentences";
test("splits on sentence terminators and newlines, 1-based sequential", () => {
  expect(splitSpec("A starts. B ends!\nC waits")).toEqual([
    { index: 1, text: "A starts." },
    { index: 2, text: "B ends!" },
    { index: 3, text: "C waits" },
  ]);
});
test("does not split on decimals or e.g.", () => {
  expect(splitSpec("Retry up to 3.5 times e.g. on timeout.")).toHaveLength(1);
});
test("empty and whitespace-only input yield []", () => {
  expect(splitSpec("")).toEqual([]);
  expect(splitSpec("  \n\t ")).toEqual([]);
});
test("sample 1 splits into exactly 6 sentences, S5 mentions cancel", () => {
  const s = splitSpec(readFileSync("samples/order-checkout.txt", "utf8"));
  expect(s).toHaveLength(6);
  expect(s[4].text).toMatch(/cancel/);
});
```
- [ ] Step 2: FAIL → Step 3: implement (regex splitter with decimal/abbreviation guard; no NLP dep) → Step 4: PASS → Step 5: commit `feat: deterministic sentence splitter + samples`.

### Task 3: Decoders + validators (TDD)

**Files:** Create `lib/decode.ts`, `lib/validate.ts`, `lib/errors.ts`, `tests/decode.test.ts`, `tests/validate.test.ts`.
**Interfaces:**
- `lib/decode.ts`: runtime decoders from `unknown`, strict (unexpected fields rejected, every field type-checked, bounded): `decodeExtractionOutput(u): {viability, machine: Machine|null} | DecodeErr`, `decodeRankOutput(u)`, `decodeRankRequest(u)`, `decodeCachedSample(u)`, `decodeOpEnvelope(u)`. Bounds: id/name ≤64 chars, rationale ≤300, surfaceForms ≤10 entries, evidence ≤20 entries, suggestions ≤10, plus the collection caps. Extraction DTO excludes `userAdded` (server data never carries it).
- `lib/validate.ts`: semantic validators over DECODED values, returning `VErr = { code: string; subject: string; message: string }`; tests assert exact code + subject.

Validation code matrix (every code gets ≥1 dedicated invalid fixture; the count of fixtures MUST equal the count of codes plus boundary cases listed):
`validateMachineShape` codes: `initial_count` (0 initials; separate fixture for 2), `dup_id`, `blank_id`, `bad_id_charset` (ids must match `^[a-z0-9_]+$`, which also makes holeKey injective), `blank_name` (whitespace-only), `dangling_ref`, `nondeterministic` (duplicate from+event), `final_outgoing`, `too_large` (one fixture per bound: 31 states, 31 events, 201 transitions).
`validateExtraction` codes: `evidence_range` (0 and sentenceCount+1), `no_evidence` (non-userAdded element with empty evidence; companion fixture: userAdded empty evidence PASSES), `bad_surface_forms` (empty list, blank entry, duplicate entry), `bad_rationale` (blank viability reason).
`validateRankOutput` codes (suggestion semantics live HERE, since suggestions arrive in the rank op): `suggested_collision` (vs other suggestions only; collisions vs machine event ids are NOT validation failures: they are dropped server-side after validation, counted in `droppedSuggestions`), `bad_confidence` (-0.1 and 1.1), `bad_rationale` (blank). Processing order: decode → validateRankOutput (repairable) → drop machine-id collisions (never repairable).
Decoder tests (table-driven): null root, missing arrays, wrong primitive types (boolean id, string evidence), non-sequential sentence indices, unexpected extra fields, oversize strings/collections, malformed JSON handled at the caller.

- [ ] Steps: failing matrix (count the fixtures against the matrix above before implementing) → FAIL → implement → PASS → commit `feat: runtime decoders and structured validators`.

### Task 4: Structural gap engine + evidence composition (TDD)

**Files:** Create `lib/gaps.ts`, `holeEvidence` in `lib/machine.ts`, `tests/gaps.test.ts`, fixture `tests/fixtures/order-checkout.machine.json` (hand-derived Sample 1 machine).
**Interfaces:** `computeGaps(m: Machine): Gaps`, pure, BFS reachability, deterministic ordering (machine state order then event order). `holeEvidence(m, hole)` per the contract above.

- [ ] Step 1: failing tests, all literal assertions (no comment-only tests):
```ts
test("order-checkout: the complete literal hole set (hand-derived, state order then event order)", () => {
  const g = computeGaps(oc);
  expect(g.missingTransitions).toEqual([
    { stateId: "cart", eventId: "payment_succeeded" },
    { stateId: "cart", eventId: "payment_failed" },
    { stateId: "cart", eventId: "handed_to_courier" },
    { stateId: "processing", eventId: "checkout" },
    { stateId: "processing", eventId: "cancel" },
    { stateId: "processing", eventId: "handed_to_courier" },
    { stateId: "paid", eventId: "checkout" },
    { stateId: "paid", eventId: "payment_succeeded" },
    { stateId: "paid", eventId: "payment_failed" },
    { stateId: "paid", eventId: "cancel" },
  ]);
  expect(g.unreachableStateIds).toEqual([]);
  expect(g.deadEndStateIds).toEqual([]);
});
test("synthetic topology: exact unreachable and dead-end sets", () => {
  // EXACT: states a(initial), b, c(final), orphan, sink; events e1, e2;
  // transitions a-e1->b, b-e2->c, orphan-e1->sink.
  const g = computeGaps(synthetic);
  expect(g.unreachableStateIds).toEqual(["orphan", "sink"]);
  expect(g.deadEndStateIds).toEqual(["sink"]);
});
test("final states contribute no rows", () => {
  const rows = computeGaps(oc).missingTransitions.map(h => h.stateId);
  expect(rows).not.toContain("cancelled");
  expect(rows).not.toContain("shipped");
});
test("deterministic ordering: first hole is cart+payment_succeeded", () => {
  expect(computeGaps(oc).missingTransitions[0]).toEqual({ stateId: "cart", eventId: "payment_succeeded" });
});
test("holeEvidence: sorted dedup union", () => {
  // fixture with state evidence [4,2] and event evidence [5,2]
  expect(holeEvidence(fx, { stateId: "s", eventId: "e" })).toEqual([2, 4, 5]);
  // flagship: [2, 5]
  expect(holeEvidence(oc, { stateId: "processing", eventId: "cancel" })).toEqual([2, 5]);
});
```
- [ ] Step 2: FAIL → implement → PASS → commit `feat: gap engine and evidence composition`.

### Task 5: Single LLM endpoint, extract op (schema, prompt, budgeted repair loop, taxonomy)

**Files:** Create `lib/schemas.ts`, `lib/budget.ts`, `api/llm.ts`, `tests/llm-handler.test.ts`, `scripts/smoke-extract.mjs`.
**Interfaces:**
- Model contract, extract op (strict structured outputs; object root, all fields required, nullable via union): `{ viability: {isSpec: boolean, reason: string}, machine: Machine | null }`. Cross-field rules enforced after decode: `isSpec=true` implies non-null machine passing decode + both validators; `isSpec=false` implies `machine=null` (violations are semantic failures → repair retry).
- HTTP contract: `200 {kind:"machine", machine, sentences}` | `200 {kind:"not_spec", reason, sentences}` | ApiError per the trust-boundary and taxonomy contracts above (405/415/413/400/`too_long`/429/422 `model_refusal`/502 `model_invalid` after 3 semantic failures/503 `upstream_failure`; messages never leak internals; every path mapped, nothing reaches a raw 500).
- Prompt encodes: ADR 0001 flat machine, reified outcome events, bounded repetition as label text; canonical snake_case event ids (charset rule) + surfaceForms; evidence as numbers of the provided numbered list. No suggested events in this op (second amendment).
- Repair loop uses `lib/budget.ts` per the budget contract.

- [ ] Step 1: failing handler tests with injected fake transport (mock the transport ONLY): (a) dangling ref then valid → 2 calls, 200; (b) 3 invalid → 502 `model_invalid`; (c) refusal → 422, 1 call; (d) transport throw → 503; (e) 4,001 chars → 400 `too_long`, 0 calls; (f) whitespace-only → 400, 0 calls; (g) GET → 405; (h) text/plain → 415; (i) body 64 KB+1 → 413, 0 calls (64 KB exactly passes the gate); (j) malformed JSON → 400; (k) `isSpec:false` with non-null machine → repair retry; (l) 11th request in a minute across MIXED ops → 429, 0 calls; (m) fake-timer budget tests per `lib/budget.ts` contract.
- [ ] Step 2: FAIL → implement → PASS.
- [ ] Step 3: Real-call check: `node scripts/smoke-extract.mjs` posts Sample 1 via local `npx vercel dev`; confirm machine ≈ hand-derived table, evidence in range, print elapsed. Commit `feat: llm endpoint with extract op`.

### Task 6: Store + approved-prototype conversion and wiring (Day-1 finish line)

**Files:** Create `src/store.ts`, `src/llmClient.ts`, minimal `SpecPane.tsx`, `Canvas.tsx`, `GapPanel.tsx`; wire `App.tsx`.
**Interfaces:** Store: `{draftSpec, activeSpec, sentences, machine, gaps (derived), suggestedEvents, displayHoles, rankTruncated, viabilityRefusal, phase, error, sessionSeq, rankSeq, machineRev, dirty}`; actions `setDraftSpec, extract(), applyExtraction(payload, seq)`.
**Session rules (tested):** `draftSpec` (textarea) is separate from `activeSpec` (what the current machine was extracted from), so editing the textarea after submission never mislabels the rendered result. `sessionSeq` and `rankSeq` are monotonic and never reset; EVERY async completion (success, rejection, finally) is guarded by `sessionSeq`, and rank completions additionally by `rankSeq` and the `machineRev` captured at rank start (out-of-order re-ranks: the older resolution is discarded; edits during ranking: only still-existing pair keys receive metadata). Selecting a cached sample invalidates pending live operations (bumps `sessionSeq`). A failed or not_spec extraction leaves the previous machine and session artifacts fully intact (tested). A new successful extraction resets, in one atomic update: ranks, `rankTruncated`, suggestions, stubs, dismissed set, evidence highlight, viability state. `extract()` refuses (no request made) when the spec is empty/whitespace or over 4,000 chars, surfacing the reason inline.

- [ ] Step 1: failing store tests with deferred fake client: (a) applyExtraction(oc) → 10 holes; (b) A then B started, B resolves, A resolves late → B authoritative; (c) A rejects AFTER B succeeded → B state untouched, no error shown; (d) failure clears `phase` via finally and sets `error`; (e) not_spec → refusal set, machine null; (f) new extraction resets all six session fields (seed them first); (g) 4,001-char spec → no client call, inline reason.
- [ ] Step 2: FAIL → implement → PASS.
- [ ] Step 3: Convert the explicitly approved `design-samples/state-gap-mapper.html` structure,
  tokens, and interaction contract into `SpecPane`, `Canvas`, `GapPanel`, and `StubsPanel`.
  First prove the React shell against the same fixture state, then replace fixture reads with the
  store selectors/actions from Steps 1-2. SpecPane retains textarea, live `N / 4000` counter,
  invalid-submit refusal, and sample buttons; Canvas uses dagre/React Flow without drifting from
  the approved SVG composition; GapPanel shows unranked cards with `holeEvidence` sentence
  numbers and click-persistent evidence highlighting. Loading copy: `Extracting your state
  machine. This takes a few seconds.` Errors come from `ApiError.message` with a retry button
  when `retryable`. Do not introduce a generic interim layout.
- [ ] Step 4: Behavioral verify (`npx vercel dev`): Sample 1 → 5-state graph, flagship card, S2+S5 highlight on click; cookie recipe → refusal, no graph; screenshots. **Day 1 gate: the 30-second demo path exists.** Commit `feat: end-to-end paste to gaps`.

---

## Day 2 (Jul 20): rank op, all gap categories, interactions, trust layer, polish

### Task 7: Rank op + Suggested Events + set-preserving merge + full gap UI

**Files:** Extend `api/llm.ts` (rank op), create `lib/rankMerge.ts`, `tests/rank.test.ts`; modify `src/store.ts`, `GapPanel.tsx`.
**Interfaces:**
- Model contract, rank op: input machine + numbered sentences + server-computed holes; output `{rankedHoles: RankedHole[], suggestedEvents: SuggestedEvent[]}` (second amendment: suggestions live here). Pipeline: decode → `validateRankOutput` (repairable) → drop machine-id collisions (counted, not repaired).
- HTTP success DTO, exact: `200 {kind:"rank", rankedHoles, suggestedEvents, truncated: boolean, droppedSuggestions: number}` | ApiError (full taxonomy applies to this op: refusal 422, invalid-after-retries 502, transport 503, all tested); truncation boundary tested at 100 and 101 holes; when `truncated`, the store keeps the flag and GapPanel shows `Ranked the first 100 holes; the rest remain listed as Unranked.`
- `mergeRanks(authoritative, ranked, validStateIds)` per the invariant contract above.

- [ ] Step 1: failing tests:
```ts
test("mergeRanks: set preservation under adversarial rank output", () => {
  // authoritative: [{processing,cancel},{cart,payment_succeeded},{paid,cancel},{paid,checkout}]
  // ranked: fabricated {ghost,cancel}; duplicate {processing,cancel} twice (relevance .9 then .1);
  //         omits {paid,checkout}; relevance 1.7 on {cart,payment_succeeded};
  //         suggestedTargetStateId "cancelled" (final state, VALID) on {processing,cancel};
  //         suggestedTargetStateId "ghost" (invalid) on {paid,cancel}.
  const out = mergeRanks(auth, ranked, new Set(["cart","processing","paid","cancelled","shipped"]));
  // literal tuple comparison, no production key helper:
  const tuples = out.map(h => [h.stateId, h.eventId]).sort();
  expect(tuples).toEqual(auth.map(h => [h.stateId, h.eventId]).sort());
  expect(out.find(h => h.stateId==="processing")!.rank!.relevance).toBe(0.9);          // first duplicate kept
  expect(out.find(h => h.stateId==="processing")!.rank!.suggestedTargetStateId).toBe("cancelled"); // final state survives
  expect(out.find(h => h.stateId==="cart")!.rank!.relevance).toBe(1);                  // clamped
  expect(out.find(h => h.stateId==="paid" && h.eventId==="cancel")!.rank!.suggestedTargetStateId).toBeNull();
  expect(out.find(h => h.stateId==="paid" && h.eventId==="checkout")!.rank).toBeNull(); // omitted => Unranked
});
test("rank handler recomputes holes server-side; invalid machine 400 with zero calls", () => { /* literal */ });
test("rank-after-newer-extraction is discarded", () => { /* store: rank for session N resolves after session N+1; no metadata applied */ });
```
- [ ] Step 2: FAIL → implement → PASS.
- [ ] Step 3: Client orchestration test (the second-amendment behavior, executable): extraction resolves while rank is deferred → graph and structural holes observable immediately; rank resolves → ordering + rationales + suggestion cards appear. Rank failure → holes stay visible unranked with a polite error.
- [ ] Step 4: GapPanel full contract: three labeled sections: Missing Transitions (rankable), Unreachable States, Dead-End States (both unranked cards with `Structural` label and evidence from the state); all three count toward the gap total (store test using the Task 4 synthetic topology asserts visible entries for `orphan` and `sink` and a total of missingTransitions + 2). New holes from edits appear on top labeled `Unranked`; `Re-rank` button; Suggested Event cards amber/dashed + `Suggested` text label + Confidence.
- [ ] Step 5: Behavioral verify on Sample 1 (flagship near top, rationale non-blank; kill network mid-rank → unranked but visible). Commit `feat: rank op, suggested events, full gap UI`.

### Task 8: Editable canvas via validated domain commands

**Files:** Fill `lib/commands.ts`, `tests/commands.test.ts`; modify `Canvas.tsx`, `store.ts`.
**Interfaces:** Pure commands `(machine, args) → {ok: true, machine} | {ok: false, error: VErr}`; store applies, bumps `machineRev`, re-runs gaps. Every command returns `unknown_id` for stale/nonexistent ids and never partially mutates (atomicity tested). **Cap preservation:** every successful command validates its complete candidate machine against the shared domain limits (30 states, 30 events, 200 transitions, 64-char ids/names incl. collision suffixes, 10 surface forms, 20 evidence entries) and returns `too_large` instead of exceeding them; merges that would exceed a cap are rejected, never silently truncated (boundary tests at 30/31 states and a merge whose union would hit 11 surface forms).
- `addState(name)`: slugify; empty slug (whitespace/punctuation-only name) → `blank_name`; collision → `_2`, `_3`.
- `renameState/renameEvent(id, name)`: non-blank; ids stable.
- `mergeEvents(sourceId, targetId)`: rewrites transitions, unions surfaceForms AND evidence, removes source; rejects on resulting duplicate (from,event) (`nondeterministic`).
- `deleteState(id)`: cascades incident transitions; rejected for initial (`initial_required`).
- `setInitial(id)`; `toggleFinal(id)` (to-final rejected while outgoing transitions exist).
- `addTransition(from, to, event: {kind:"existing", id} | {kind:"new", name})` (discriminated union): duplicate → `nondeterministic`; final source → `final_outgoing`; new event slugified with collision suffix.
- `deleteTransition(from, eventId)`.
- [ ] Step 1: failing tests: every rule happy + rejection, atomic failure (machine unchanged on error), whitespace/punctuation-only names, unknown ids, plus: adding (processing, cancel) removes that hole; deleting a state's only inbound edge makes it unreachable; a merge that would collide rejects and preserves evidence when it succeeds.
- [ ] Step 2: FAIL → implement → PASS.
- [ ] Step 3: Canvas wiring: node/edge add/delete, rename via double-click AND node inspector panel (pointer-free fallback), edge drawing with event picker, `Added by you` badges. Dirty guard: new extraction OR cached-sample selection while `dirty` opens confirm `Extracting again will replace your edits. Continue?` (store-tested for both paths).
- [ ] Step 4: Behavioral verify: live gap-count changes while editing Sample 1; initial-state delete blocked with tooltip; both dirty-confirm paths. Commit `feat: validated editable canvas`.

### Task 9: Accept / Dismiss + Test Stubs

**Files:** Create `lib/teststub.ts`, `tests/teststub.test.ts`, `src/components/StubsPanel.tsx`; extend `lib/commands.ts`, `GapPanel.tsx`, `store.ts`.
**Interfaces:**
`renderStub({stateName, eventName, targetName: string | null, evidence: number[]}): string`, exact outputs:
```
# Evidence: sentences 2, 5
Given the system is in state Processing
When cancel occurs
Then the system moves to Cancelled
```
and with `targetName: null` the final line is exactly `Then define the expected outcome`.
Commands:
- `acceptHole(machine, hole, target: {kind:"existing", stateId} | {kind:"new", name}) → {ok, machine, stub} | {ok: false, error}`: stale hole (already defined or ids gone) → `unknown_id`; the stub is part of the command result (contract matches the promise).
- `acceptSuggestedEvent(machine, se, accepted: ReadonlyMap<string, string>) → {ok, machine, acceptedEventId} | ...`: provenance is a Map from stable suggestion id to the machine event id it became (updated atomically with the machine in the store), so suffixing is remembered: with a pre-existing `code_expired` event, accepting the `code_expired` suggestion creates `code_expired_2` and maps to it; accepting it again is a no-op returning `code_expired_2` (no `_3`: tested); deleting the accepted event then re-accepting creates it fresh (tested).
- `dismissHole` / `undoDismiss`: dismissed set keyed by (stateId, eventId) tuple, scoped to the session (cleared on new extraction: tested); a dismissed pair that becomes defined by an edit and later reappears as a hole REMAINS dismissed within the session (tested); dismissed section in the UI lists pairs with visible Undo buttons; stale keys dropped on access.
- [ ] Step 1: failing tests: both exact template strings; acceptHole happy path returns machine AND stub; stale accept; suggestion provenance cases above; dismissal persistence + reset + undo; cascade: accepting Sample 3's expiry suggestion creates exactly 3 new holes.
- [ ] Step 2: FAIL → implement → PASS.
- [ ] Step 3: UI: mini-picker (focus trapped in, Escape closes, Enter confirms), disabled confirm until target chosen; stubs with copy buttons showing `Copied` / `Copy failed, select the text manually`.
- [ ] Step 4: Behavioral verify: flagship accept end to end (target Cancelled), copy stub; Sample 3 cascade. Commit `feat: accept, dismiss, test stubs`.

### Task 10: Trust layer: coverage diff + matrix drawer

**Files:** Modify `SpecPane.tsx`, `GapPanel.tsx`; pure selector in `lib/`.
- `uncoveredSentences(machine, sentenceCount): number[]`; test: machine referencing S1-S4 of 6 → `[5, 6]`.
- SpecPane: uncovered sentences grayed, title text `This sentence did not map to any state, event, or transition.`, `N of M sentences mapped` line.
- Matrix drawer: full state × event grid with explicit cell precedence `defined > not-applicable > dismissed > hole`; final-state rows render their undefined cells as `not applicable` (distinct muted style, not holes, matching the fixed semantics); text tooltips, never color alone. Nothing hidden (ADR 0002).
- Gap counting is a tested selector: `activeGapCount = displayHoles not dismissed + unreachable + deadEnd`; dismissing reduces it, undo restores it (store tests).
- [ ] Steps: failing selector test → implement → behavioral verify on Sample 1 + appended unmapped sentence (`Refunds are handled by finance.`) → commit `feat: coverage diff and matrix drawer`.

### Task 11: Sample caching + sample UX

**Files:** Create `scripts/cache-samples.mjs`, `samples/cached/*.json`, `tests/cached-samples.test.ts`; modify `SpecPane.tsx`, `llmClient.ts`.
Script runs BOTH ops per sample via local `npx vercel dev`, writes full payloads. Client: selecting a sample loads its cache instantly (zero API; dirty-confirm applies per Task 8); edits switch to the live path.
- [ ] Step 1 (independent oracles, not self-certification): the three hand-derived canonical machines and hole sets are written LITERALLY into the test file (Sample 1's 10 tuples exactly as in Task 4; Sample 2: draft/approve, draft/request_changes, draft/publish, in_review/submit, in_review/publish, in_review/archive, approved/submit, approved/approve, approved/request_changes, approved/archive; Sample 3: unverified/unlock, unverified/deactivate, active/code_correct, active/code_incorrect_3x, active/unlock, locked/code_correct, locked/code_incorrect_3x, locked/deactivate). Per cached sample assert: `decodeCachedSample` accepts it (versioned schema, `version: 1`); validators return `[]`; `splitSpec(sampleText)` equals cached sentences exactly; the cached machine's state ids, event ids, and transitions equal the canonical machine exactly; the cached raw ranked (stateId, eventId) tuples, compared literally without any production helper, equal the LITERAL hole set (computeGaps may run afterward as a consistency check only); every rationale non-blank; relevance in [0,1]; every `suggestedTargetStateId` names a machine state; Sample 1's (processing, cancel) ranks in the top 3 by relevance; Sample 2 top 3 includes (approved, request_changes); Sample 3 has a Suggested Event matching `/expir/i`. Caches are curated artifacts: if generation diverges from the canonical machine (for example different event naming), tune the prompt or regenerate until it matches; never weaken the oracle.
- [ ] Step 2: generate, test; regenerate rather than weaken on failure. Commit caches + tests.
- [ ] Step 3: Behavioral verify: DevTools offline, full Sample 1 demo end to end. Commit `feat: cached sample pipeline`.

### Task 12: Design polish + scoped accessibility

**Files:** `styles.css`, all components.
- Visual regression against the approved Task-0 prototype: subtle gap pulse, disabled entirely under `@media (prefers-reduced-motion: reduce)` (verified by DevTools emulation screenshot); Suggested amber/dashed + text label vs Structural red/solid + text label; empty state fronting samples; header: `Paste how a feature should behave. See the state machine. Find what the spec forgot.` Task 12 is a final fidelity pass, not the first substantive design pass.
- Accessibility scope: all non-canvas controls are real buttons/inputs, keyboard reachable, visible focus; evidence highlight click-persistent; copy feedback both outcomes; status via label + color. OUT (documented deviation): keyboard graph drawing on canvas; the inspector panel is the fallback.
- Desktop 1280px+ only.
- [ ] Steps: implement → behavioral verify: 1280/1536 screenshots, keyboard-only pass over gap panel and accept picker, reduced-motion screenshot → commit `style: demo polish and scoped accessibility`.

---

## Day 3 (Jul 21): deploy, verify, video, submit (deadline 5:00pm PT)

### Task 13: Deploy + live verification

- [ ] `npx vercel build` locally, deploy, set `OPENAI_API_KEY` in Vercel env, production deploy.
- [ ] Live verify on production (`?bust=1`): three samples instant + offline-capable; one novel spec through the live path (record elapsed); viability refusal on garbage. Rate limiting verified by handler tests; best-effort in production (documented); no live 429 gate. Screenshots; evidence quoted in session log.
- [ ] Commit `chore: production config`, push public GitHub repo.

### Task 14: Submission package

- [ ] README: what/how to run (`npm ci`, `.env.local`, `npx vercel dev`), architecture sketch, Codex-collaboration narrative (Codex accelerated: decoders, taxonomy, gap engine, canvas; human decided: ADRs, council review, this plan). No em dashes.
- [ ] Demo video <3 min, YouTube public: 0:00 paste Sample 1 → 0:20 graph → 0:30 flagship pulses, click, evidence highlights → 0:50 accept → stub → 1:10 Sample 3 suggestion cascade → 1:40 live edit, count updates → 2:10 built with Codex + GPT-5.6 structured outputs → 2:50 positioning close.
- [ ] Devpost: Dev Tools track, description, video URL, repo URL, **Codex Session ID** (covers Tasks 1-12), judges-test-free note.
- [ ] Final check against `HACKATHON.md` checklist; submit before 3:00pm PT (2-hour buffer).

## Risks / cut lines (pre-agreed)

Cut order if behind: matrix drawer visual states (keep drawer) → Re-rank button → Sample 2 (keep 1 and 3) → node inspector (keep double-click + document). Never cut: flagship path, cached samples + oracle tests, viability refusal, accept-to-stub, evidence highlighting, rank-merge set equality, single-function limiter, all-three-gap-categories UI. Streaming stays a stretch goal.

## Review disagreements (consensus protocol, documented)

- Built-topology integration test for the limiter (iteration-2 critical remedy): mooted by adopting the reviewer's primary suggestion (single op-discriminated function); the limiter is tested at the handler level and documented best-effort per warm instance.
- Streamed extraction: resolved by DESIGN_DECISIONS amendments (reviewer-offered option), now consistent: suggestions moved to call 2, so call 1 carries nothing that could delay first render.
- Full keyboard canvas graph drawing: rejected for 3-day scope; inspector fallback + full keyboard support on non-canvas surfaces.

## Accepted residual risk (gate exhausted at 3 iterations; deliberate, altitude-appropriate)

Iteration-3 items NOT folded in, accepted as residual risk for a 3-day hackathon demo with no
account system and no stored data. Do not silently expand scope to cover them; revisit only if
the product outlives the hackathon:
- Exhaustive adapter-level byte tests (chunked bodies, missing/misleading Content-Length): the
  raw-byte gate is implemented and unit tested; adversarial transport encodings are not.
- IPv6 normalization, minute-rollover precision, and distributed limiter behavior beyond the
  documented per-warm-instance best effort.
- Control characters in state/event names beyond the id charset rule and 64-char bounds.
- Coverage-diff micro-cases (evidence only on transitions, post-deletion recount) beyond the
  tested selector contract.
- Suffix-overflow pathology (a 64-char name colliding repeatedly) beyond the cap-rejection rule.
