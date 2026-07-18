# State Gap Mapper: DESIGN.md

Binding visual spec for the build session. Decoded from the approved mockups:
`mockups/var-a-minimal.png` (locked canvas character), `mockups/hero-v2.png` (full screen),
and the component crops `crop-gapcard.png`, `crop-accept-beforeafter.png`, `crop-stubstrip.png`.
Supersedes `DESIGN_BRIEF.md` where they differ (the brief was direction; this is the spec).

Decode note: the mockups render the brief's palette faithfully (sampled red bar `#DA2F32`
sits in the `#E8474F` family), so the brief's deliberate clean tokens below are locked as final
rather than replaced with lossy pixel samples.

---

## 1. Color tokens (locked)

| Token | Hex | Role |
|---|---|---|
| `--blueprint` | `#102338` | App background, canvas field, deepest surface (drawer/stub strip go one step deeper, see below) |
| `--blueprint-deep` | `#0C1B2C` | Test-stub code strip only, the one surface below blueprint |
| `--panel` | `#16304F` | Spec pane, gap cards, drawers, sample chips, evidence chips |
| `--chalk` | `#DDE9F5` | Primary text, drawn linework, node strokes, edge strokes |
| `--faded` | `#6C89A6` | Secondary text, uncovered sentences, muted edges, grid dots, labels, line numbers |
| `--redline` | `#E8474F` | Structural Gaps ONLY: gap-card rule/label, ghost annotation, relevance bar, `<TODO>` |
| `--amber` | `#EFA93B` | Suggested Events ONLY: card border, `Suggested` tag, Confidence |

**Semantic law (do not violate):** `--redline` and `--amber` are semantic, never decorative.
Nothing else on the screen is red or amber. There is no success/green token: accepting a gap
does not add color, it *erases* the red ink (annotation becomes a `--chalk` drawn edge). That
erase IS the reward. Links/quiet buttons (Accept, Dismiss, Docs, Show all) use `--faded` raised
toward a soft blue on hover, never an accent color.

---

## 2. Typography (locked)

Two families, and the sans/mono split encodes the fact/prose boundary: **anything machine-derived
is mono.**

- **Barlow** (DIN-flavored grotesque) — UI and display.
  - Wordmark: SemiBold, letter-spacing `+0.12em` (tracked wide), uppercase.
  - Pane titles (`SPEC`, `CANVAS`, `GAPS (10)`, `TEST STUBS (1)`): SemiBold, uppercase, `+0.06em`.
  - Section labels (`REDLINE`, `Suggested (1)`): SemiBold small.
  - Spec sentence prose, gap rationale: Regular.
- **IBM Plex Mono** — all machine-derived data: state ids, event names, event-label pills,
  evidence chips (`S2`, `S5`), sentence numbers, the `312 / 4000` counter, relevance/confidence
  numerals, the Gherkin stub, sample-chip labels, pair lines (`processing x cancel`).

Type scale (rem @ 16px base): wordmark 1.25 · pane title 0.8125 (tracked) · body/prose 0.9375 ·
gap pair line 1.0 · rationale 0.875 · chips/counter/labels 0.75 · stub code 0.9375.

---

## 3. Geometry tokens

- Radius: nodes & cards `10px`, chips & label pills `6px`, buttons `8px`.
- Stroke: node/edge linework `1.5px` `--chalk`; gap-card left rule `3px` `--redline`;
  suggested-card border `1.5px` dashed `--amber`.
- Grid unit `8px`. Pane gutters `24px`, card padding `16px`, section gaps `20px`.
- Canvas dot-grid (variant A, locked): `--faded` dots at ~`10%` opacity, `24px` spacing, `1px`.
  This is the minimal character; do not render the heavy graph grid (that was variant B).

---

## 4. App shell layout

Desktop 1280+, single screen, no scroll on the shell (panes scroll internally).

```
┌ HEADER (56px) ─────────────────────────────────────────────────────────────┐
│ wordmark  ·  positioning line (faded)                               Docs    │
├ SPEC (fixed ~340px) ┬ CANVAS (fluid, flex:1) ┬ GAPS (fixed ~380px) ─────────┤
│                     │                         │                             │
│  numbered sentences │  dot-grid drafting field│  stacked gap cards          │
│  coverage line      │  nodes + edges + ghost  │  Suggested section          │
│  sample chips        │                         │  matrix link                │
│  char counter        │                         │                             │
├─────────────────────┴─────────────────────────┴─────────────────────────────┤
│ TEST STUBS drawer (collapsible, ~140px open)  ·  chevron toggle              │
└──────────────────────────────────────────────────────────────────────────────┘
```

Header: wordmark left; positioning line `Paste how a feature should behave. See the state
machine. Find what the spec forgot.` in `--faded` immediately right of it; `Docs` quiet link
far right. `1px` `--panel` bottom border. Panes divided by `1px` `--panel` rules.

---

## 5. Component anatomy

### 5.1 Spec pane
- Sentence row: mono numeral in `--faded` (fixed-width gutter), prose in Barlow Regular `--chalk`.
- **Uncovered sentence** (zero evidence refs): whole row in `--faded` (grayed), no highlight.
- **Evidence-highlighted sentence** (selected gap's evidence): `--chalk` text on a translucent
  `--redline` wash (~`16%` alpha), `3px` `--redline` left edge. (Sample 1: sentence 5.)
- Coverage line below sentences: mono, `--faded`, `6 of 6 sentences mapped`.
- Sample chips: three, `--panel` fill, mono `--faded` labels `order checkout` · `document
  approval` · `account signup`. One click loads the cached sample.
- Char counter: mono `--faded`, bottom-aligned, `312 / 4000`.

### 5.2 Canvas
- **Node**: rounded-rect (`10px`), `1.5px` `--chalk` outline, transparent fill, centered mono
  state id in `--chalk`.
  - Initial state (`cart`): small filled `--chalk` dot + short entry arrow on its left.
  - Final state (`cancelled`, `shipped`): double outline (inner + outer stroke, ~`3px` gap).
- **Drawn edge**: `1.5px` solid `--chalk` line with arrowhead; event label in a small outlined
  pill (`--blueprint` fill, `1px` `--faded` border, mono `--chalk` label). Labels: `checkout`,
  `payment_succeeded`, `payment_failed`, `cancel`, `handed_to_courier`.
- **Redline ghost annotation (signature element):** the top-ranked Missing Transition renders
  ON the canvas as a bold `--redline` **dashed** edge stub leaving the source node (`processing`,
  right side), curving out to die into a `--redline` `???` tag. Hand-sketched pencil character.
  It is the single loudest element; nothing else competes.
  - Default: slow pulse (see Motion).
  - Selected (its card active): ghost goes solid `--redline`, evidence sentences light in Spec.
  - Accepted: converts in place to `--chalk` linework (see 5.5).
- User-added elements carry no evidence and are labeled `added by you`.

### 5.3 Gap panel — Structural Gap card
Expanded (front) card anatomy, top to bottom (see `crop-gapcard.png`):
1. `3px` `--redline` left rule, full card height, `--panel` fill, `10px` radius.
2. Label `REDLINE` — SemiBold small, `--redline`.
3. Pair line — mono `--chalk`, `processing x cancel` (the `x` is a literal separator).
4. **Relevance**: a SHORT `--redline` bar (~⅓ card width, `--panel`/faded track behind) with the
   mono numeral beside it, `0.92`. Short by rule so red does not compete with the ghost.
5. Rationale — Barlow Regular `--chalk`, one line, `Cancel is handled in Cart but Processing
   never defines it.`
6. Evidence chips — mono, `--panel` fill + `1px` `--faded` border, `S2` `S5`.
7. Actions — quiet text buttons `Accept` and `Dismiss`, `--faded` (blue on hover), bottom-right.

Collapsed cards (behind the front one): same `3px` `--redline` left rule, mono pair line only
(`cart x payment_succeeded`, `paid x checkout`), a chevron to expand. Unreachable and Dead-End
gaps reuse this anatomy under their own labels, unranked (no relevance bar).

Panel header: `GAPS (10)` with a small warning glyph. Count is live.

### 5.4 Gap panel — Suggested Event card
Identical card footprint, but: `1.5px` **dashed** `--amber` border (no left rule), mono label
`payment_timeout`, an `Suggested` tag (amber outline), and `Confidence 0.71` (mono) in place of
the relevance bar. Under a `Suggested (1)` section header in `--amber`. Below the suggested
section: a quiet `Show all 10 undefined pairs` link (`--faded`) opening the matrix.

### 5.5 Accept conversion (erase-the-ink) — see `crop-accept-beforeafter.png`
The reward interaction, one continuous transition:
- **Before:** `processing` node + `--redline` dashed arrow → `--redline` `???`.
- **After:** `--redline` fully gone; a solid `--chalk` edge leaves `processing`, carries a
  `cancel` label pill, and lands on the `cancelled` node (double-outline final). The gap card
  leaves the list and the `Gaps (N)` count decrements.
No green, no checkmark, no toast. The disappearance of red and the appearance of chalk linework
is the entire success signal.

### 5.6 Test Stubs drawer — see `crop-stubstrip.png`
- Header row: flask glyph + `TEST STUBS (1)` (Barlow, uppercase), chevron toggle far right.
- Code strip on `--blueprint-deep` (the one surface below blueprint), inner border `1px` `--panel`.
- Mono line numbers `1 2 3` in a `--faded` left gutter with a `1px` `--faded` divider.
- Gherkin body, IBM Plex Mono: keywords `Given` / `When` / `Then` tinted muted blue (`--faded`
  toward blue), operands in `--chalk`, and `<TODO: define target>` in `--redline`.
  - L1 `Given the system is in state Processing`
  - L2 `When cancel occurs`
  - L3 `Then <TODO: define target>`
- `Copy` button top-right of the strip (`--panel` fill, `1px` `--faded`, mono label).

---

## 6. Motion

- **Ghost pulse:** the redline ghost annotation pulses slowly (opacity/glow ease, ~2s loop). It
  is the only ambient motion on the screen.
- **Accept conversion:** a single short transition (~250ms) morphing red dashed → chalk solid and
  routing the edge to its target node. Not a bounce, not a flash.
- **Everything else:** static. No hover animation beyond a color shift on quiet controls.
- **`prefers-reduced-motion`:** the pulse stops completely (ghost holds at full-visible); the
  accept conversion becomes an instant state swap.

---

## 7. State inventory the build must cover

1. **Empty / paste** — textarea + placeholder modeling expected shape, three sample chips, char
   counter at `0 / 4000`, empty canvas, empty gap panel. (Not yet mocked; opening video shot.)
2. **Non-viable input** — friendly refusal in place of a machine (never render a machine from a
   recipe / lorem / code dump).
3. **Mid-session (mocked, Sample 1)** — the locked screen: machine drawn, ghost pulsing, gaps
   ranked, one suggested event, one stub.
4. **Gap selected** — ghost solid, evidence sentences lit.
5. **Gap accepted** — erase-the-ink conversion, count decremented, stub finalized.
6. **Gap dismissed** — pair leaves list + count, stays in the full matrix (undoable).
7. **Canvas edited** — re-run structural analysis instantly; new holes appear unranked at top of
   list; `added by you` elements carry no evidence.
8. **Matrix view** — cells: drawn (filled), hole (outlined `--redline`), dismissed (`--faded`),
   not-applicable final-state cells (near-invisible hatch).
