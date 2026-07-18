# Design decisions from the grilling session (2026-07-18)

Companion to `CONTEXT.md` (glossary) and `docs/adr/` (0001 flat FSM, 0002 two-tier gaps,
0003 sentence-index evidence). These are the settled non-ADR decisions; the implementation
plan builds on all of it without re-litigating.

## Input scope (Codex's "any feature description is a trap" warning)

Free textarea, bounded by shaping rather than a rigid form:

- Three sample specs one click away, seeded so the flagship demo gap is a Tier-1 fact
  (`cancel` handled in one state, absent in `processing`).
- Placeholder text that models the expected shape: states, actors, what happens when.
- A `viability` field in the same extraction call's schema: if the input is not a behavioral
  spec (recipe, lorem ipsum, code dump), return a friendly refusal instead of a hallucinated
  machine. Never render a machine from non-viable input.
- Length cap around 4,000 characters.

Rejected: a guided multi-field form. It would kill the "judge pastes their own real spec"
moment, which is the best case for this product, not a stress test.

## Accept / Dismiss mechanics

- **Accept a Missing Transition** → mini-picker asks where the event leads (LLM-suggested
  default target, or create a new state) → transition lands on the canvas as a drafted edge
  marked user-accepted → Test Stub generated.
- **Accept a Suggested Event** → event joins the machine's event set → structural analysis
  re-runs → its new Missing Transition holes appear (the demo cascade).
- **Dismiss** → pair marked intentional, leaves gap list and count, stays visible in the
  full matrix. Undoable.
- All state client-side (localStorage at most). No DB, no auth, per the build shape.

## Test Stubs

- Given/When/Then (Gherkin-style), framework-neutral, the audience is dev/PM/QA, so no
  framework assumption. Copy button per stub.
- Generated from a deterministic template, not the LLM: Given ⟨state⟩ (evidence sentences
  cited as a comment), When ⟨event⟩, Then ⟨accepted target or TODO placeholder⟩. Instant,
  zero latency, cannot hallucinate.

## Canvas edits and re-analysis

- Any canvas edit (add/delete/rename state, add/delete edge) re-runs structural gap analysis
  instantly, client-side, it is pure graph math (ADR 0001 consequence).
- No automatic LLM call on edit. New holes created by an edit appear at the top of the gap
  list marked unranked; a manual "re-rank" button re-runs the Relevance pass. Keeps latency
  and cost user-controlled.
- User-added elements carry no Evidence; labeled "added by you" (ADR 0003).
- Pasting a new Spec = full re-extraction and discards canvas edits, behind a confirmation.

## Council review addenda (2026-07-18 debate: Gemini + Codex + Kimi K3, unanimous keep-all-five)

The panel kept all five decisions and added three guardrails. All three are additive; none
reopens an ADR.

1. **Spec Coverage Diff (the machine-vs-spec trust layer).** Deterministic gaps are honest
   about the extracted machine, not the original spec: if extraction silently drops a
   sentence, no tier can recover it. Fix is deterministic and client-side: any Sentence with
   zero Evidence references renders grayed in the spec pane ("this sentence mapped to
   nothing"), with a coverage indicator. No LLM narration anywhere in audit surfaces,
   computed, never generated (panel 2-1 against Codex's "why extracted" pane; Codex conceded
   the LLM-self-justification form of it).
2. **Canonical event IDs in the extraction schema.** `cancel`/`cancellation`/`abort` must not
   fragment the matrix. The extraction schema carries a canonical `id` plus surface forms,
   filled inside the same validated call, not a post-hoc fuzzy merge. Wrong assignments are
   correctable on the canvas (rename/merge), per the editable-canvas insurance policy.
3. **Cache the three seeded samples end-to-end.** Judges test live Jul 22 to Aug 5; the
   flagship demo must survive API latency, rate limits, and outages. Pre-compute the full
   pipeline output (extraction + ranking + accept-targets) for the three sample specs and
   ship as static JSON; live API path used for pasted specs. No DB needed.

Latency amendment (Codex's mechanism, adopted by Kimi): Suggested Events stay in call 1
(the model has the full spec in context there) but are an optional, streamed-last field,
the structural graph renders before they arrive. First canvas never blocks on them.

AMENDED 2026-07-18 (plan review iteration 1): streaming partial structured output is out of
scope for the 3-day build. Call 1 returns one completed response; the canvas renders
immediately on completion, and Suggested Events plus Relevance ranking fill into the gap
panel afterward via the non-blocking call 2. The binding requirement is reduced to: the
canvas and Structural Gap list must never wait on ranking, and Suggested Events must never
delay Structural Gap display. Streaming states into the canvas remains a stretch goal only.

AMENDED AGAIN 2026-07-18 (plan review iteration 2): Suggested Events move from call 1 to
call 2. With streaming out of scope, keeping them in call 1 provably delays first render,
contradicting the requirement above. Call 2 receives the machine AND the numbered
sentences, so the full-spec context that justified call 1 placement is preserved. Final
shape: call 1 = viability + machine only (fastest possible first canvas); call 2 = relevance
ranking + accept targets + Suggested Events, all non-blocking.

Also confirmed by the panel: the product blurb in STATE_GAP_MAPPER.md still says gaps carry
"confidence scores", pre-glossary wording. CONTEXT.md governs: Relevance for Missing
Transitions, Confidence only for Suggested Events.

## LLM call inventory (latency budget)

1. **Extraction** (blocking, streamed): spec → machine JSON + viability + Suggested Events.
   Consider one combined call; stream states/edges into the canvas as they parse.
2. **Relevance ranking** (non-blocking): holes → ranked list + rationales. Canvas renders
   before this returns; gap cards fill in as it lands.
3. **Accept-target suggestion** (on demand, cheap): can be pre-computed by call 2 returning
   a suggested target per top-ranked hole, avoiding a third call entirely. Preferred.
