# State Gap Mapper

**Find the behavior your feature spec forgot before it becomes a bug.**

Paste a product flow in plain English. State Gap Mapper shows how it behaves, redlines places where the outcome is undefined, connects every finding to the original words, and turns approved decisions into test-ready steps.

[Watch the 2:45 demo](https://youtu.be/-kOouhl8B78) · [Try the live app](https://state-gap-mapper-build.vercel.app) · [Explore the reproducible demo source](./demo-video/README.md)

![Three panels showing a checkout Spec, the missing cancellation behavior while Processing, and the human-approved transition to Cancelled with a test stub](./docs/assets/readme/workflow-overview.svg)

## The short version

Feature specs are usually good at describing the happy path. The costly questions appear when a known event happens at an unexpected moment:

- What happens if a customer cancels while payment is processing?
- What happens if an approval is withdrawn after publication begins?
- What happens when a verification code expires?

State Gap Mapper turns the Spec into a visual behavior map, checks every known state and event combination, and marks the undefined outcomes. A reviewer then decides whether each one is a real omission or an intentional non-transition.

The diagram is the explanation surface. Finding missing behavior is the product.

## A real example

The checkout sample says:

1. Checkout moves an order from **Cart** to **Processing**.
2. Payment success moves it to **Paid**.
3. Payment failure returns it to **Cart**.
4. Cancellation works from **Cart**.

The Spec never says what cancellation should do while the order is **Processing**.

State Gap Mapper therefore shows `processing x cancel` as a red Structural Gap. It attaches sentences 2 and 5 as Evidence, so the reviewer can see exactly why the question exists.

![The current production Structural Gap card for processing by cancel, with a 0.98 Relevance score and evidence from sentences 2 and 5](./docs/assets/readme/current-gap-card.jpg)

If the reviewer chooses **Cancelled** as the intended target, the red `???` becomes a normal transition and the application drafts:

```gherkin
Given the system is in state Processing
When cancel occurs
Then the system moves to Cancelled
```

The product decision remains human. State Gap Mapper makes the missing decision visible and turns the answer into usable engineering output.

## What you do in the app

1. **Paste or import a Spec.** Type plain-English behavior, load a `.txt`, `.md`, or `.markdown` file, or choose one of the three instant samples.
2. **Map the behavior.** GPT-5.6 extracts the states, events, transitions, and sentence Evidence into an editable diagram.
3. **Review the redlines.** Deterministic TypeScript checks the complete state-and-event matrix and lists every undefined outcome.
4. **Make the product decision.** Accept a gap and choose its target, or Dismiss it when the undefined behavior is intentional.
5. **Use the output.** Copy the generated Test Stub, download a Markdown report, or save a lossless JSON project that can be reopened later.

![The current State Gap Mapper production workspace showing the checkout Spec, behavior canvas, Structural Gaps, a Suggested Event, and the Test Stubs drawer](./docs/assets/readme/current-workspace.jpg)

The cached samples load without an API call, so anyone can try the complete interface immediately.

## What the visual language means

| What you see | What it means |
| --- | --- |
| Chalk-colored nodes and lines | Behavior the Spec actually defines, or behavior you explicitly added |
| Red arrow ending in `???` | A known event has no defined outcome in that state |
| Red Structural Gap card | A deterministic finding that needs a human decision |
| Amber Suggested Event card | An AI suggestion for an event the Spec may not have considered |
| Sentence chips such as `S2` and `S5` | Evidence linking the finding back to the original Spec |
| `added by you` | A state, event, or transition created by the reviewer rather than extracted from the Spec |

Red and amber deliberately mean different things. A Structural Gap is a computed fact about the current map. A Suggested Event is a possibility proposed by GPT-5.6.

## Why the result stays honest

![Two panels explaining that GPT-5.6 understands and prioritizes the prose while deterministic TypeScript validates the machine and checks every structural gap](./docs/assets/readme/honesty-model.svg)

GPT-5.6 handles semantic work: understanding the prose, extracting the machine, ranking the most relevant undefined outcomes, explaining them, and suggesting plausible new events.

Deterministic TypeScript remains authoritative for validation, the complete Structural Gap set, Evidence composition, coverage changes, and Test Stub generation. The model may order the findings. It cannot invent a Structural Gap, remove one, or hide one.

Accepting a gap is always a reviewer decision. The application never silently rewrites the product behavior.

## Who it helps

- **Product managers** can expose ambiguous behavior before a handoff becomes rework.
- **Engineers** can turn prose into a reviewable state model and concrete edge-case questions.
- **QA teams** can trace missing behavior to the Spec and convert decisions into Given/When/Then starting points.
- **Cross-functional teams** can review the same visual model instead of interpreting the same paragraph differently.

State Gap Mapper works best with structured behavioral flows: named situations, events, and resulting outcomes. It will refuse input that is not a viable feature Spec. It is not intended for strategy documents, free-form brainstorming, or general-purpose diagram generation.

## Files, saving, and privacy

| Action | What happens |
| --- | --- |
| Import `.txt`, `.md`, or `.markdown` | The local file fills the Spec editor. It is not mapped until you choose **Map this spec**. |
| Map a novel Spec | The Spec is sent through the application's serverless endpoint to OpenAI for structured extraction and ranking. |
| Open a State Gap Mapper `.json` project | The validated project is restored locally without an LLM call. Structural Gaps are recomputed rather than trusted from the file. |
| Download a Markdown report | A deterministic human-readable report is created in the browser. |
| Download a JSON project | A lossless logical project file is created in the browser so the work can be reopened later. |

State Gap Mapper has no account system and no project database. Work lives in the current browser session unless you download a project file.

## Frequently asked questions

### Is every red gap an AI guess?

No. Red Structural Gaps come from deterministic analysis over the extracted behavior map. GPT-5.6 only ranks them by likely relevance and provides a rationale.

### What is a state?

A state is a named situation the feature can be in, such as **Cart**, **Processing**, **Paid**, or **Cancelled**.

### What is a Suggested Event?

It is an event GPT-5.6 believes the feature may need, even though the Spec never mentions it. Suggested Events are amber, carry a Confidence score, and remain visually separate from factual Structural Gaps.

### Does accepting a gap change the original Spec?

No. It changes the editable behavior map and creates a Test Stub. The original Spec remains visible as Evidence.

### Can I try it without an API key?

Yes. The three cached sample projects work immediately. An API key is needed only when running the project locally and mapping a novel Spec.

### Can I save my work?

Yes. Download a JSON project and reopen it later. You can also download a Markdown report for documentation or review.

### Can I reuse the source code?

The repository is publicly viewable but is not offered under an open-source license. All rights are reserved; do not copy, modify, or redistribute the source without permission.

## Run it locally

```bash
cp .env.example .env.local   # add your OPENAI_API_KEY for novel Specs
npm ci
npx vercel dev
```

Open the local URL printed by Vercel. The cached samples work without an API call.

## Built with Codex and GPT-5.6

Codex was the implementation partner across the domain model, strict runtime decoders, deterministic gap engine, editable canvas, tests, production debugging, deployment verification, import/export workflow, and Remotion demo.

Human direction set the product position, architecture records, two-tier honesty model, and redline design language. GPT-5.6 powers structured extraction, Relevance ranking, rationales, target suggestions, and Suggested Events inside the application.

## Technical reference

TypeScript · React · Vite · React Flow · Zustand · OpenAI GPT-5.6 structured outputs · Vercel

| Path | What it contains |
| --- | --- |
| [`CONTEXT.md`](./CONTEXT.md) | Product vocabulary and invariants |
| [`DESIGN.md`](./DESIGN.md) | Binding visual system and component anatomy |
| [`docs/adr/`](./docs/adr/) | Architecture decisions for the state model, gap engine, and Evidence |
| [`docs/plans/`](./docs/plans/) | Implementation and public-repository plans |
| [`demo-video/`](./demo-video/) | Reproducible 2:45 Remotion demo and verified production captures |
| [`samples/`](./samples/) | The three built-in behavioral Specs and cached results |
| [`tests/`](./tests/) | Domain, API, store, component, and file-transfer coverage |

The application is live and production-verified at [state-gap-mapper-build.vercel.app](https://state-gap-mapper-build.vercel.app).
