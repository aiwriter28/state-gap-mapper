# State Gap Mapper: Design Brief

Input for the GPT Image 2 mockup pass. The chosen mockup gets decoded into `DESIGN.md`
(tokens + component anatomy), which is what the Codex build session implements. This brief is
the direction; the image is the target; DESIGN.md will be the binding spec.

## Subject, audience, job

A spec linter that reads a plain-English feature spec, draws the state machine it describes,
and marks what the spec forgot. Audience: developers, PMs, and QA, judged by technical
hackathon judges watching a sub-3-minute video. The screen's single job: make one missing
transition feel like a found bug, in under 30 seconds.

## Direction: the reviewed blueprint

The subject's world is engineering diagrams and code review. The design language merges them:
the app reads as a technical drawing that a sharp-eyed reviewer has marked up in red pencil.
The machine is the drawing; the gaps are the redlines. This gives the product's two-tier
honesty story a visual form: drawn linework is fact, red markup is the finding, amber pencil
is the suggestion.

This is deliberately NOT the generic dark dev-tool look (near-black with one acid accent).
The surface is blueprint blue-ink, not black; the accents are two functional markup colors
with semantic meaning, not decoration; the canvas carries a faint drafting dot-grid; and the
type story comes from drafting-standard lettering.

## Tokens (starting values; final values get sampled from the approved mockup)

Palette, 6 named values:

| Token | Hex | Role |
|---|---|---|
| Blueprint | #102338 | App background, deepest surface |
| Panel | #16304F | Spec pane, gap panel, drawers, cards |
| Chalk | #DDE9F5 | Primary text, drawn linework, node strokes |
| Faded | #6C89A6 | Secondary text, uncovered sentences, muted edges, grid dots |
| Redline | #E8474F | Structural Gaps only: gap cards, ghost annotations, the pulse |
| Pencil Amber | #EFA93B | Suggested Events only: cards, dashed strokes, Confidence |

Rule: Redline and Pencil Amber are semantic and never decorative. Nothing else on the screen
is red or amber. Accepting a gap does not add a success color: it erases the red ink (the
annotation becomes a drawn Chalk edge), which IS the reward moment.

Typography, 2 roles:

- UI and display: Barlow (a DIN-flavored grotesque; drafting-standard lettering ancestry).
  Semibold for headings and node names, regular for body. Header wordmark in Barlow SemiBold,
  tracked slightly wide, set next to the positioning line in Faded.
- Data: IBM Plex Mono for everything machine-derived: state ids, event names, evidence chips
  (S2, S5), sentence numbers, test stubs, matrix labels. The mono/sans split encodes the
  fact/prose boundary: if it came from the machine, it is mono.

## Layout

Three panes plus a bottom drawer, desktop 1280+:

```
+--------------------------------------------------------------------------+
| State Gap Mapper       Paste how a feature should behave. ...      [Docs] |
+----------------+----------------------------------------+----------------+
| SPEC           | CANVAS (dot-grid drafting field)       | GAPS  (3)      |
|  1 A new order |                                        | +------------+ |
|  2 When the... |   [cart] --checkout--> [processing]    | | REDLINE    | |
|  3 If payment  |      \--cancel-->[cancelled]           | | processing | |
|  4 If payment  |   [processing] ~~cancel~~> ???  <-pulse| |  x cancel  | |
|  5 The custom..|   [paid] --handed_to...--> [shipped]   | | S2  S5     | |
|  6 Once a Paid |                                        | | Accept /   | |
|  [samples]     |                                        | |  Dismiss   | |
|  N/4000        |                                        | +------------+ |
|                |                                        | SUGGESTED (1)  |
+----------------+----------------------------------------+----------------+
| Test Stubs (1)                photo-negative strip: mono, copy buttons    |
+--------------------------------------------------------------------------+
```

- Spec pane: numbered sentences in mono numerals, prose in Barlow; uncovered sentences in
  Faded with the coverage line `5 of 6 sentences mapped`; evidence highlighting = Chalk text
  on a translucent Redline wash.
- Canvas: Blueprint field with a faint Faded dot-grid. Nodes are rounded-rect Chalk outlines
  with mono state ids; the initial state carries a small filled entry arrow, final states a
  double outline. Drawn transitions are solid Chalk edges with mono event labels in small
  outlined pills.
- Gap panel: stacked cards on Panel. Structural Gap card anatomy: thin Redline left rule, mono
  pair line (`processing x cancel`), Relevance as a short Redline bar with numeral, one-line
  rationale in Barlow, evidence chips as mono S-number tags, Accept and Dismiss as quiet text
  buttons. Unreachable and Dead-End sections use the same anatomy, labeled, unranked.
  Suggested Events identical shape but Pencil Amber rule, dashed border, `Suggested` label,
  Confidence instead of Relevance.
- Bottom drawer: Test Stubs and the matrix. Stubs render like a code strip: mono on the
  deepest surface. Matrix cells: drawn (filled), hole (outlined Redline), dismissed (Faded),
  not-applicable final-state cells (near-invisible hatch).

## Signature element

The redline ghost annotation. The top-ranked Missing Transition renders ON the canvas as a
red dashed edge stub leaving the state and dying into a small `???` tag, pulsing slowly, as
if a reviewer sketched the missing arrow in red pencil. Selecting its card makes the ghost
solid red and lights the evidence sentences. Accepting it converts red ink to Chalk linework
in place. This is the one bold element; everything else stays quiet and disciplined.

Motion beyond the pulse and the accept conversion: none. The pulse fully stops under
prefers-reduced-motion.

## Self-critique pass (against the generic defaults)

- Risk: dark UI collapses into the near-black single-accent default. Countered by: blue-ink
  surface, two semantic markup colors, dot-grid texture, and the erase-the-ink accept
  interaction. If the mockups come back looking like a generic dark dashboard, the fix is
  more blueprint (visible grid, more drawn-line character in nodes), not more accent color.
- Rejected alternatives: cream-paper linter (light, serif, terracotta): reads as the default
  AI look and pulses poorly on video. Broadsheet hairline grid: wrong world, this is a
  drawing, not a document.
- The numbered spec sentences are real structure (they ARE the evidence anchors), so the
  numbering earns its place; nothing else gets numbered.

## Functional inventory the mockups must show (no invented UI)

Content is Sample 1 (order checkout), mid-session state:
1. Header: wordmark + `Paste how a feature should behave. See the state machine. Find what the spec forgot.`
2. Spec pane: the 6 real sentences, sentence 5 highlighted as evidence, `6 of 6 sentences mapped`, three sample chips, `312 / 4000`.
3. Canvas: 5 nodes (cart initial, processing, paid, cancelled final, shipped final), 5 drawn edges with labels (checkout, payment_succeeded, payment_failed, cancel, handed_to_courier), the redline ghost `processing ~~cancel~~> ???` pulsing.
4. Gap panel: `Gaps (10)` with the flagship card expanded (Relevance 0.92, rationale `Cancel is handled in Cart but Processing never defines it.`, chips S2 S5, Accept, Dismiss), two collapsed cards behind it, `Suggested (1)` amber card (`payment_timeout`, Confidence 0.71), a `Show all 10 undefined pairs` matrix link.
5. Bottom drawer, partially open: one Gherkin stub (the exact Given/When/Then from the plan) with a Copy button.

## Image generation notes (for the GPT Image 2 pass, next step)

- 3 variants of the full app screen, 1440-wide desktop framing, 3:2, PNG.
- Same prompt skeleton, vary only the canvas character: (a) strict minimal drafting,
  (b) heavier blueprint texture with visible grid, (c) higher-contrast redline emphasis.
- Text in the mockup must use the real strings above; GPT Image 2 handles text well, so
  demand exact copy.
- Judge the variants for: 30-second legibility at video scale, whether the ghost annotation
  reads instantly as the point, and whether it avoids generic dark-dashboard energy.
