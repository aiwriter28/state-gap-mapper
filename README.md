# State Gap Mapper

**A spec linter that reads a plain-English feature spec, draws the state machine it describes, and marks what the spec forgot.**

Paste how a feature should behave. See the state machine. Find what the spec forgot.

Track: Developer Tools. Built with Codex, powered by GPT-5.6.

## What it does

1. **Paste** a feature's behavior in plain English (or load a sample).
2. GPT-5.6 extracts a schema-constrained **state machine**, rendered as an interactive, editable graph (React Flow).
3. Deterministic analysis flags every **Missing Transition** and unhandled event as a gap, with a relevance score and evidence links back to the exact spec sentences.
4. The top gap renders on the canvas as a **redline ghost annotation** — a red dashed arrow into a `???`, as if a reviewer sketched the missing case in pencil.
5. **Accept** a gap to draw the transition in and generate a Gherkin **test stub**; **dismiss** it to mark it intentional.

The two-tier honesty model matters: deterministic graph math *detects* gaps (never hallucinated), the LLM only *ranks* them. See `docs/adr/`.

## Design language

The reviewed blueprint: the app reads as a technical drawing a sharp-eyed reviewer marked up in red pencil. Drawn linework is fact, red markup is the finding, amber is the suggestion. Full spec in [`DESIGN.md`](./DESIGN.md); approved mockups in [`mockups/`](./mockups/).

## Stack

TypeScript · React · Vite · React Flow · OpenAI GPT-5.6 structured outputs. No DB, no auth — state is client-side. The three sample specs ship as pre-computed static JSON so the demo survives API latency.

## Repository map

| Path | What |
|---|---|
| `DESIGN.md` | Binding visual spec (tokens + component anatomy) the build implements |
| `docs/plans/` | The implementation plan |
| `docs/adr/` | Architecture decisions: flat FSM, two-tier gaps, sentence-index evidence |
| `mockups/` | Approved design mockups (locked: `var-a-minimal.png`) |
| `CONTEXT.md`, `DESIGN_DECISIONS.md` | Glossary and settled non-ADR decisions |

## Setup

```bash
cp .env.example .env.local   # add your OPENAI_API_KEY
npm install
npm run dev
```

> Status: design and spec complete; build in progress.
