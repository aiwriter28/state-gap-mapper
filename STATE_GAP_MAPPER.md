# State Gap Mapper — Chosen Idea (Decision Record)

> Decided 2026-07-18 after two runs of the multi-model Innovation Engine (Gemini 3.5 Flash,
> Codex gpt-5.6-sol @ xhigh, Kimi K3) plus Chairman synthesis. Raw pipeline outputs:
> `innovate-runs/run1-2026-07-18-partial-panel.json` (Codex seat was down; superseded) and
> `innovate-runs/run2-2026-07-18-full-panel-xhigh.json` (authoritative — all 3 models, all 9
> rounds, all 3 phases). Note: run 2's JSON labels the Codex seat "gpt-5.5" but it actually ran
> gpt-5.6-sol (model came from ~/.codex/config.toml; the -m pin landed after launch).
>
> This doc is the handoff into the planning session. Constraints and rules live in
> `HACKATHON.md`; strategy rationale in `SUBMISSION_OPTION.md`; demo lessons in `PAST_WINNERS.md`.

---

## The product

**Track: Developer Tools.** Paste a feature's behavior in plain English → GPT-5.6 extracts a
schema-constrained state machine → rendered as an interactive, editable graph (React Flow) →
**missing transitions and unhandled events are flagged as pulsing gaps** ("no transition defined
for *cancel* during *processing*") with confidence scores and evidence links back to the spec
text → accepting a gap generates a test-case stub.

**The 30-second aha:** paste a five-sentence spec that sounds complete → clean diagram appears →
one flashing red gap the spec never mentioned → click → a generated test case. "It found the
edge case you forgot."

**Positioning (critical):** this is a **spec linter**, not a diagram generator. Stately.ai
already does text-to-state-machine. The moat is the gap analysis + evidence-linked test
generation; the diagram is just the display surface. Never pitch "AI draws state diagrams."

Origin: Codex's idea #3 in the run-2 diverge phase.

## Final panel scores (run 2 converge, round 3)

| Idea | Gemini | Codex | Kimi |
|---|---|---|---|
| **State Gap Mapper** | **44/50 — #1** | **44/50 — #1** | 41/50 — #2 |
| Complexity Dial | 42 — #2 | 40 — #3 | **43 — #1** |
| Five Second Mirror | 39 | 40 — #2 | — |
| One Question Left (reframed) | 40 | excluded | excluded |
| Claim Evidence Receipt | — | 39 | 39 |

All three models closed high-confidence that the winner is SGM or Complexity Dial. Kimi (the
Dial holdout) conceded SGM's ceiling is higher and the 2-point gap is "within noise"; its
decision rule was "if judges are technical, swap to SGM" — Dev Tools judges will be technical.
Gemini started round 1 with Complexity Dial #1 and **pivoted to SGM in round 2** after the
editable-canvas argument. Chairman pick: SGM (majority + strongest on all four equally weighted
criteria at once).

## Why it won (the arguments that decided the debate)

1. **The editable-canvas insurance policy** (Gemini, round 2 pivot): if the LLM draws an
   imperfect state machine, the user drags/edits/deletes nodes live — an AI error becomes a
   collaborative draft, not a broken demo. Ideas with a one-shot "AI reveals the answer" moment
   (One Question Left, First Wrong Turn) die instantly when the reveal is wrong. SGM degrades
   gracefully.
2. **Survives unscripted judge input**: judges can test the live app themselves through Aug 5
   (see HACKATHON.md). Text-in means no photo/OCR variance, and a technical judge pasting their
   own real spec is the best case, not a stress test.
3. **Reads as real engineering**: text → schema-constrained JSON → graph → gap-analysis →
   test generation is a visible multi-step pipeline. Both Gemini and Codex used it as the
   counterexample to "a prompt behind a polished control" — it targets the Technological
   Implementation criterion directly.
4. Fits the PAST_WINNERS lesson: input → visible result → clean UI, legible in ~30s.

## Risks and required de-risking (from the panel's own critiques)

- **Codex's scope warning (its own idea, round 2):** "any feature description" is a trap —
  vague prose produces plausible but invented states, and canvas editing merely transfers
  validation to the user. **Bound the safe scope to structured product flows** (e.g., a guided
  input format or examples that shape the spec), and make gaps confidence-ranked +
  evidence-linked to the exact spec sentence, with accept/reject.
- **Codex's differentiation warning:** "could appear like a diagram generator unless missing
  transitions produce evidence-linked test cases and genuinely interactive editing." Those two
  features are not polish — they ARE the product.
- **Gemini's one-shot-syntactic-perfection warning (assumption-reversal phase):** LLMs don't
  reliably emit perfect structured output in one pass. Use strict JSON schema validation with a
  self-healing retry loop; never render unvalidated model output into the graph.
- **Latency (both runs):** LLM chains run 5–30s. Design the loading state; consider streaming
  states/edges into the canvas as they parse (this can itself look great on video).
- **Stately.ai overlap (Chairman):** positioning risk only — see Positioning above.
- Deliberately NOT chosen: Complexity Dial (Kimi's #1; higher floor, capped ceiling — "one
  prompt behind a slider" per Gemini and Codex; softer track was its main draw).

## Judging criteria mapping (all four weighted 25%)

- **Technological Implementation**: core build in ONE Codex + GPT-5.6 session (Session ID
  required); app itself calls GPT-5.6 with structured outputs — "built with Codex, powered by
  GPT-5.6" narrative.
- **Design**: complete coherent product, not a POC — editable canvas, confidence-ranked gap
  cards, generated tests, sample specs for judges with nothing to paste.
- **Potential Impact**: spec gaps drive expensive engineering rework; audience = every dev/PM/QA.
- **Quality of Idea**: spec-linting framing (gap-finding), differentiated from diagram
  generators and code-review tools.

## Build shape (starting point for the plan — not the plan)

- Stack: TS/React/Vite + React Flow + GPT-5.6 structured outputs. No DB, no auth, no vision.
  Deploy to Vercel. Judges test free.
- Day 1: spec → validated state-machine JSON → rendered graph → gap detection, end to end.
- Day 2: editable canvas, gap accept/reject with evidence links, test-stub generation, design
  polish, sample specs.
- Day 3: demo video (<3 min, YouTube), README Codex-collaboration narrative, deploy, submit
  before Jul 21 5:00pm PT.
- Submission checklist and Codex Session ID requirements: `HACKATHON.md`.

## Next step (new session)

Start a fresh session in this folder, invoke the engineering OS skill (`engineering-skill-os`),
and write the implementation plan from this doc. The core build itself must then happen in a
single clean Codex + GPT-5.6 session so the Session ID covers the majority of core functionality
from the first commit.
