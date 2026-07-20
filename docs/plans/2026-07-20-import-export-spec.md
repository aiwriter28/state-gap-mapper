# State Gap Mapper Import and Export Specification

**Status:** Ready for implementation  
**Date:** 2026-07-20  
**Scope:** Local file import, project restore, and deterministic result export  
**Architecture:** Browser-only file handling; no database, account, upload storage, or new server endpoint

## 1. Outcome

A user can bring an existing behavioral Spec into State Gap Mapper without copying it by hand,
download a human-readable record of the analysis, and save a lossless logical project file that can
be opened later. Canvas layout and transient presentation state are regenerated, not preserved.

The feature must preserve the product's trust model:

- A text or Markdown file supplies a Spec only. It does not bypass viability checks and does not
  start an LLM request until the user explicitly chooses `Map this spec`.
- A State Gap Mapper project file restores previously validated application state without an LLM
  call.
- Structural Gaps are recomputed from the restored machine. They are never trusted from imported
  JSON.
- Relevance can order authoritative Missing Transitions but can never add or hide one.
- Every imported value is treated as untrusted and decoded before it reaches the store or UI.
- Downloads are generated deterministically in the browser from the current validated state.

## 2. User needs

### Import a Spec

As a developer, PM, or QA reviewer, I can select a `.txt`, `.md`, or `.markdown` file and load its
contents into the existing Spec editor so I can review the text before mapping it.

### Resume a project

As a returning user, I can open a `.json` project file previously downloaded from State Gap Mapper
and recover the Spec, machine edits, applicable rankings and suggestions, dismissals, and Test
Stubs without calling the API.

### Share results

As a collaborator, I can download a `.md` report that is useful without State Gap Mapper and that
clearly separates deterministic findings, LLM-ranked metadata, suggestions, and user decisions.

### Preserve work

As a user in a client-only application, I can download a `.json` project before closing the tab and
open it later without losing an unmapped draft, accepted transitions, or other logical canvas edits.

## 3. Formats

| Extension | Direction | Meaning | MIME type |
| --- | --- | --- | --- |
| `.txt` | Import | UTF-8 plain-text Spec | `text/plain` |
| `.md`, `.markdown` | Import | UTF-8 Markdown Spec, treated as source text | `text/markdown` |
| `.json` | Import and export | Versioned State Gap Mapper project | `application/json` |
| `.md` | Export | Deterministic human-readable analysis report | `text/markdown` |

Extension matching is case-insensitive. Browser-reported MIME metadata is advisory because it is
inconsistent across operating systems. The extension determines the route after the file passes
the size check.

The first release does not accept arbitrary JSON as a Spec. A `.json` file must match the State Gap
Mapper project format in section 8.

## 4. Scope

### Included

- Native file picker opened by an `Import` action.
- `.txt`, `.md`, and `.markdown` import into the Spec draft.
- `.json` restore of a project downloaded by this feature.
- Markdown report download.
- Versioned JSON project download.
- Strict decode, semantic validation, resource limits, replacement confirmation, and accessible
  error/status feedback.
- Deterministic regeneration of Structural Gaps and display ordering on project restore.
- Browser-native file and download APIs with no new runtime dependency.

### Not included

- PDF, DOCX, RTF, YAML, OpenAPI, image, archive, or source-code parsing.
- Google Drive, Dropbox, GitHub, URL, clipboard, or other remote import.
- Server-side file storage, accounts, sync, sharing links, or autosave.
- Importing a generic state-machine JSON dialect.
- PDF report generation.
- PNG, SVG, or React Flow canvas export.
- Drag-and-drop. It can reuse the same parser later, but it is not required for the first release.
- Automatic mapping immediately after text import.
- Automatic re-ranking immediately after project restore.
- Migration of unknown future project versions. Version 1 must fail closed on any other version.

## 5. Product language

- **Import:** Select a local file and route it by extension.
- **Spec file:** A `.txt`, `.md`, or `.markdown` file containing only the Spec.
- **Project file:** A versioned `.json` snapshot that restores logical State Gap Mapper work. Node
  layout, viewport, and other presentation state are regenerated.
- **Report:** A deterministic `.md` rendering intended for people and downstream documentation.
- Avoid **upload** in UI copy. The application does not store the selected file remotely.
- Avoid **exported analysis** for the JSON action. Use **project** so users understand that the file
  is intended for restoration, not just reading.

## 6. User interface

### Header actions

Add a quiet action group on the right side of the existing header in this order:

1. `Import`
2. `Export`
3. `Docs`

The actions use the existing quiet-button treatment. They must not use `--redline` or `--amber`,
which remain reserved for Structural Gaps and Suggested Events.

`Import` activates one visually hidden native file input with:

```text
accept=.txt,.md,.markdown,.json,text/plain,text/markdown,application/json
```

`Export` opens a keyboard-operable action panel with two native buttons:

- `Download report (.md)`
- `Download project (.json)`

Both export actions are disabled when no machine exists or while extraction or ranking is pending.
A rank failure does not disable export; the report and project can represent unranked Missing
Transitions.

### Feedback

- Import failures render as concise `role="alert"` text associated with the Import control.
- Successful import and download messages use a subdued `role="status"` live region.
- No toast, green success treatment, red decorative error styling, or ambient animation is added.
- Cancelling the operating-system picker has no effect and produces no message.
- After a failure, focus returns to `Import`.
- After closing the Export action panel with Escape, focus returns to `Export`.

### Responsive behavior

At widths where the positioning line no longer fits, it yields before the file actions. The action
labels remain visible and keyboard reachable. The existing desktop workspace geometry is otherwise
unchanged.

## 7. Import behavior

### Shared preflight

For every selected file:

1. Route by the lowercase filename extension.
2. Check `File.size` against that format's limit before reading.
3. Read the file locally.
4. Decode and validate a complete candidate without mutating application state.
5. Ask for replacement confirmation only after the candidate is known to be valid.
6. Apply the candidate atomically or leave the current state unchanged.
7. Reset the native input value after handling so selecting the same file again triggers `change`.

Reading, parsing, validation, and confirmation errors must never partially update the store.
File actions maintain a monotonic `importSeq`. Activating `Import` increments it synchronously
before opening the native picker and associates that value with the pending selection. Selection
uses that captured value; cancellation leaves the already-advanced value in place. Read, decode,
error, and confirmation completions act only while their captured value is current. Opening a newer
picker therefore supersedes an earlier slow read or open confirmation even before the user chooses
or cancels a file.

### Text and Markdown Spec import

- Maximum file size before decoding: 64 KiB.
- Encoding: UTF-8 only. Invalid UTF-8 is rejected rather than replaced with placeholder glyphs.
- One leading UTF-8 byte-order mark is removed.
- Markdown is not rendered, stripped, or interpreted. Its source text becomes the Spec exactly.
- After BOM removal, the decoded string is stored without content transformation. If the user edits
  it, native textarea behavior may normalize CRLF or lone CR line endings to LF; project export
  preserves the current store value, not the original file bytes.
- The imported content must contain non-whitespace text.
- The imported content must contain at most 4,000 JavaScript characters after BOM removal, matching
  the existing editor and store boundary.
- Oversized content is rejected. It is never truncated.
- A valid file replaces `draftSpec`, opens the Spec editor, and leaves the current mapped machine
  and analysis intact until the user chooses `Map this spec`.
- Import does not call `extract`, `rank`, or any server endpoint.
- If the current draft contains unsaved text different from `activeSpec`, and the imported text is
  different from the draft, confirm with:
  `Importing will replace your current Spec draft. Continue?`
- A current mapped machine by itself does not cause a text-import confirmation because text import
  does not replace it. The existing dirty-edit confirmation still applies when the user later maps
  the imported Spec.
- On success, report `Imported <filename>. Review the Spec, then map it.`

### JSON project import

- Maximum file size before parsing: 8 MiB.
- Encoding: UTF-8 only, with one optional leading BOM removed.
- Parse with `JSON.parse` into `unknown`.
- Standard JSON duplicate-member behavior applies: when an object repeats a member name,
  `JSON.parse` keeps the last value. The strict decoder validates only that resulting object.
- Require the exact project discriminator and version before decoding nested content.
- Reject unexpected fields, wrong primitive types, invalid collection sizes, and invalid domain
  semantics with a path-specific error.
- Validate all evidence indices against the imported Sentences.
- Require imported Sentences to equal `splitSpec(spec.active)` exactly for version 1.
- Allow `userAdded` only where the current editable-machine boundary allows it.
- Recompute Structural Gaps from `machine` and rebuild visible Missing Transitions through the
  existing set-preserving rank merge.
- Do not accept serialized `gaps`, `displayHoles`, counts, coverage, or selected UI state.
- Do not call the LLM, extraction endpoint, or ranking endpoint.
- Invalidate every in-flight extraction or ranking response before applying restored state.
- Restore the active and draft Specs separately so an unsaved next draft is not lost.
- Clear transient errors, selection, evidence highlight, pending state, and replacement dialogs.
- Restore whether the canvas contains edits so the existing replacement guard remains truthful.
- If the restored draft differs from the active Spec, open the Spec editor so the draft is visible.
- Catch every read, parse, and decode exception, including `RangeError`, at the adapter boundary and
  map it to static error copy without exposing exception text or changing state.

If the current application contains a non-empty draft or a machine, confirm with:

`Opening this project will replace your current Spec, canvas, gaps, and Test Stubs. Continue?`

The confirmation appears only after the project has passed decode and semantic validation. Cancel
leaves all state intact. On success, report `Opened <filename>.` If the restored draft differs from
the active Spec, report `Opened <filename>. The Spec editor contains a draft that has not been
mapped.` instead.

## 8. Project file version 1

### Canonical shape

```ts
interface Sentence {
  index: number;
  text: string;
}

interface MachineState {
  id: string;
  name: string;
  isInitial: boolean;
  isFinal: boolean;
  evidence: number[];
  userAdded?: boolean;
}

interface MachineEvent {
  id: string;
  name: string;
  surfaceForms: string[];
  evidence: number[];
  userAdded?: boolean;
}

interface Transition {
  from: string;
  event: string;
  to: string;
  evidence: number[];
  userAdded?: boolean;
}

interface Machine {
  states: MachineState[];
  events: MachineEvent[];
  transitions: Transition[];
}

interface RankedHole {
  stateId: string;
  eventId: string;
  relevance: number;
  rationale: string;
  suggestedTargetStateId: string | null;
}

interface SuggestedEvent {
  id: string;
  name: string;
  surfaceForms: string[];
  rationale: string;
  confidence: number;
}

interface TestStub {
  stateId: string;
  eventId: string;
  targetStateId: string | null;
  evidence: number[];
  text: string;
}

interface StateGapMapperProjectV1 {
  format: "state-gap-mapper-project";
  version: 1;
  exportedAt: string; // UTC ISO 8601
  spec: {
    active: string;
    draft: string;
  };
  sentences: Sentence[];
  machine: Machine; // userAdded is allowed
  canvasEdited: boolean;
  analysis: {
    ranks: RankedHole[];
    suggestedEvents: SuggestedEvent[];
    rankTruncated: boolean;
  };
  decisions: {
    dismissedPairs: Array<{ stateId: string; eventId: string }>;
    acceptedSuggestedEvents: Array<{
      suggestionId: string;
      acceptedEventId: string;
    }>;
    testStubs: TestStub[];
  };
}
```

All object field lists above are exact. `userAdded` is the only optional field and is allowed only
on machine states, events, and transitions. Every other field is required, including empty arrays.

### Resource and value limits

| Value | Version 1 rule |
| --- | --- |
| `spec.active`, `spec.draft` | At most 4,000 UTF-16 code units, matching JavaScript `String.length`; active is non-blank |
| `sentences` | At most 4,000 entries; 1-based sequential indices; text at most 4,000 code units |
| state/event ids | Non-blank, at most 64 code units, lowercase ASCII letters, digits, and underscores only |
| machine state/event names | Non-blank, at most 64 code units |
| states, events, transitions | At most 30, 30, and 200 entries respectively |
| gap matrix | At most 900 state/event pairs because both dimensions are capped at 30 |
| evidence | At most 20 integer Sentence indices per machine element or Test Stub |
| surface forms | 1 through 10 unique non-blank entries, each at most 64 code units |
| rank and suggestion rationales | Non-blank and at most 300 code units |
| ranks | At most 100 entries; Relevance must be finite and is clamped to `[0, 1]` during merge |
| Suggested Events | At most 10 entries; unique non-blank ids and non-blank names, each at most 64 code units; Confidence is finite in `[0, 1]` |
| dismissed pairs | At most 900 unique state/event pairs |
| accepted-suggestion mappings | At most 1,000 entries with unique non-blank suggestion ids; both strings at most 64 code units |
| Test Stubs | At most 500 entries; text is non-blank and at most 1,024 code units |

The machine also keeps the existing semantic invariants: exactly one initial state, unique state and
event ids, no dangling transition references, at most one transition per state/event pair, and no
outgoing transition from a final state. Model-derived machine elements require Evidence;
`userAdded: true` elements may have none.

The project-only Test Stub and accepted-suggestion limits are enforced when an action would add a
new entry. Attempting to exceed either limit fails atomically with the existing `too_large` command
error. This enforcement is new behavior added to the existing `acceptHole` and
`acceptSuggestedEvent` store actions. Together with the active-Spec limit and domain caps, this
keeps every reachable version 1 project below the 8 MiB serialized-file boundary, including
worst-case JSON escaping. Export still checks the final UTF-8 byte length before download, and the
maximum-valid-project test must prove export and re-import use the same boundary. The
maximum-valid-project test must perform and record
the worst-case byte computation before these caps are treated as final.

The JSON representation uses arrays instead of JavaScript `Set` and `Map` values. Array ordering is
stable:

- machine collections retain their current canonical order;
- ranks retain their current store order;
- suggested events retain their current display order;
- dismissed pairs sort by machine state order and then event order;
- accepted-suggestion mappings sort by `suggestionId` using JavaScript UTF-16 code-unit comparison,
  not locale-sensitive collation;
- Test Stubs retain creation order.

### Fields deliberately omitted

Do not serialize fields that are derived, transient, or local to one browser render:

- `gaps`, `displayHoles`, active gap count, or coverage count;
- `selectedHoleKey` or `highlightedEvidence`;
- `phase`, `error`, `rankError`, `rankPending`, `viabilityRefusal`, or `commandError`;
- `sessionSeq`, `rankSeq`, or `machineRev`;
- `replacementConfirmation` or `replacementIntent`;
- React Flow node positions, viewport, expanded cards, modal state, or drawer state. These are
  presentation state and are regenerated; they are not part of the lossless logical-state promise.

### Decode and semantic rules

- Root and nested objects reject unexpected fields.
- `format` must equal `state-gap-mapper-project`.
- `version` must equal `1`. Other values produce:
  `This project was created by an unsupported version of State Gap Mapper.`
- `exportedAt` must use the exact UTC form produced by `Date.prototype.toISOString()`
  (`YYYY-MM-DDTHH:mm:ss.sssZ`). It is metadata and never controls behavior.
- `spec.active` uses the same non-blank and 4,000-character rules as live extraction.
- `spec.draft` may be empty but has the same 4,000-character maximum as the editor.
- `sentences` must pass the existing strict Sentence decoder and equal `splitSpec(spec.active)`.
  This equality requirement intentionally doubles as a corruption check despite the redundant
  `sentences` field.
- `machine` must pass the editable machine decoder, `validateMachineShape`, and evidence validation.
- `canvasEdited` is a required boolean and restores the store's `dirty` replacement guard.
- `analysis.ranks` and `analysis.suggestedEvents` must pass the existing rank decoder and semantic
  validator. Suggested Events whose ids collide with current machine event ids are dropped before
  hydration, matching the live rank pipeline; the exporter omits those no-longer-applicable
  suggestions.
- Ranking pairs that are not in the recomputed authoritative Missing Transition set are dropped by
  the existing rank merge. Duplicate pairs keep the first applicable rank. Unknown suggested target
  state ids become null. Omitted pairs remain visible as Unranked.
- `dismissedPairs` has at most 900 unique pairs. Every state and event id must exist in the imported
  machine. A remembered pair may currently be defined because dismissals intentionally survive a
  defined-then-reappearing pair within a session.
- `acceptedSuggestedEvents` has at most 1,000 unique `suggestionId` entries. The remembered event id
  may be absent because deleting an accepted event and later accepting it again intentionally
  recreates the remembered id. A suggestion id need not remain in `analysis.suggestedEvents` because
  accepted suggestions leave that list. Both strings are non-blank and at most 64 code units;
  `acceptedEventId` follows the machine-id character rule. When the accepted event still exists, it
  must carry `userAdded: true`; otherwise the mapping is rejected as forged provenance.
- `testStubs` has at most 500 entries. Each field is strictly typed; `stateId`, `eventId`, and a
  non-null `targetStateId` follow the existing 64-character id bound; evidence has at most 20 valid
  Sentence indices; text is non-blank and at most 1,024 code units. Referenced states, events, and targets
  may be absent because later canvas edits do not delete historical Test Stubs.
- Duplicate dismissed pairs, duplicate accepted-suggestion mappings, duplicate Suggested Event ids,
  or structurally invalid nested values reject the complete project. Duplicate rank pairs follow
  the first-applicable-wins rule above so imported ranking can never change the authoritative set.

### Hydration rules

On successful restore:

1. Recompute `gaps` with `computeGaps(machine)`.
2. Convert `dismissedPairs` to the store's tuple-keyed `Set`; successful validation guarantees that
   both identifiers exist.
3. Merge only authoritative Missing Transitions with imported ranks using `mergeRanks`.
4. Rebuild `displayHoles` using the same ordering and dismissal rules as the live store.
5. Restore the filtered `suggestedEvents` and imported `rankTruncated` value.
6. Convert accepted-suggestion entries to the store's `Map`.
7. Restore Test Stubs in creation order.
8. Restore `spec.active` to `activeSpec`, `spec.draft` to `draftSpec`, and `canvasEdited` to `dirty`.
9. Increment `sessionSeq`, `rankSeq`, and `machineRev`. Extraction completions compare
   `sessionSeq`; rank completions compare `sessionSeq`, `rankSeq`, and their captured `machineRev`.
10. Set pending flags false; set transient errors, including `viabilityRefusal` and `commandError`,
    to null; and set selection null.

Hydration is one atomic store update.

### Version compatibility

Version 1 owns its decoding, limits, and Sentence rules. `decodeProjectV1` must not silently inherit
an incompatible future change to a general decoder. For version 1, Sentence construction is frozen
to the current behavior: split on one or more LF or CRLF line breaks, or whitespace after `.`, `!`,
or `?`; do not split after `e.g.`, with this guard applied case-insensitively; trim segments; remove
blank segments; then assign sequential 1-based indices. A lone CR is not a version 1 boundary.

Any incompatible change to this shape, these limits, or these Sentence rules emits version 2.
Future readers retain `decodeProjectV1` or run an explicit migration. Committed golden version 1
fixtures must remain readable in every later release.

### Example

```json
{
  "format": "state-gap-mapper-project",
  "version": 1,
  "exportedAt": "2026-07-20T12:00:00.000Z",
  "spec": {
    "active": "A new order starts in Cart.",
    "draft": "A new order starts in Cart."
  },
  "sentences": [
    { "index": 1, "text": "A new order starts in Cart." }
  ],
  "machine": {
    "states": [
      {
        "id": "cart",
        "name": "Cart",
        "isInitial": true,
        "isFinal": false,
        "evidence": [1]
      }
    ],
    "events": [],
    "transitions": []
  },
  "canvasEdited": false,
  "analysis": {
    "ranks": [],
    "suggestedEvents": [],
    "rankTruncated": false
  },
  "decisions": {
    "dismissedPairs": [],
    "acceptedSuggestedEvents": [],
    "testStubs": []
  }
}
```

## 9. Export behavior

### Shared behavior

- Export takes one synchronous snapshot of validated store state at activation time.
- Export never calls the server or an LLM.
- Both formats first build and validate the same `StateGapMapperProjectV1` candidate. The Markdown
  renderer consumes that validated candidate rather than a second live-store read.
- Generate content with pure deterministic functions in `lib/`.
- Download with `Blob`, `URL.createObjectURL`, and a temporary anchor using browser-native APIs.
- Append the hidden anchor to `document.body`, activate it, remove it, and revoke the object URL in a
  zero-delay later task so the browser has consumed the URL.
- Use the exact Blob types `text/markdown;charset=utf-8` and
  `application/json;charset=utf-8`.
- JSON uses two-space indentation and exactly one trailing LF. Markdown also ends with exactly one
  trailing LF.
- Encode the finished project JSON as UTF-8 and reject download if it exceeds 8 MiB. Every accepted
  exported project must therefore fit through the import boundary.
- Never include API keys, request headers, rate-limit data, local environment values, or error
  internals.
- Success copy is `Download started: <filename>.` It confirms artifact generation and browser
  activation only; browser APIs cannot confirm operating-system completion. Download failure means
  generation or activation threw synchronously.

Filenames use the UTC activation time:

```text
state-gap-mapper-report-YYYYMMDD-HHmmssZ.md
state-gap-mapper-project-YYYYMMDD-HHmmssZ.json
```

### Markdown report

The report is a portable human artifact, not a restoration format. It includes these sections in
this order:

1. `# State Gap Mapper Report`
2. Generated UTC timestamp and a one-line honesty statement.
3. `## Summary`: mapped Sentence coverage; state, event, transition, and Structural Gap counts.
4. `## Spec`: the complete active Spec, preserved as text in a safe Markdown fence.
5. `## State Machine`: state, event, and transition tables, including Evidence and `Added by you`.
6. `## Structural Gaps`:
   - Open Missing Transitions with Relevance, rationale, suggested target, and Evidence when present.
   - Dismissed Missing Transitions that are currently undefined.
   - Unreachable States.
   - Dead-End States.
7. `## Suggested Events`: name, Confidence, rationale, and an explicit `No Evidence` statement.
8. `## User Decisions`: every remembered dismissal with current `Undefined` or `Defined` status,
   plus every accepted-suggestion mapping and whether its accepted event still exists.
9. `## Test Stubs`: each current stub in creation order.
10. `## Method`: deterministic gap detection; LLM ranking and suggestions; user decisions.

Report rules:

- Use the glossary terms in `CONTEXT.md` exactly.
- Never call Relevance Confidence or call a Suggested Event a Structural Gap.
- Recompute gaps and coverage from the snapshot rather than using UI counts. Coverage is
  `sentences.length - uncoveredSentences(machine, sentences.length).length` of `sentences.length`.
- The headline Open Structural Gap count equals open Missing Transitions plus the size of the union
  of Unreachable and Dead-End state ids, matching `selectActiveGapCount`. Report total and currently
  dismissed Missing Transitions as separate values.
- Represent missing ranking metadata as `Unranked`, not zero.
- Order Missing Transitions like the UI: Unranked first, then descending Relevance, with
  authoritative machine order as the stable tie breaker. If `rankTruncated` is true, state that only
  the first 100 holes received ranking metadata.
- Represent an empty section with a plain statement such as `No Suggested Events.`
- Use context-specific deterministic encoders for every imported, model-generated, or user-edited
  value. Inline values use a code delimiter longer than any contained backtick run and replace CR/LF
  with a visible ` ⏎ ` marker. Table cells additionally encode `|`, backslash, `<`, `>`, and `&` so
  they cannot create columns, links, images, HTML, or headings. Free-form Spec, rationale, and Test
  Stub text use a fence longer than any contained backtick or tilde run.
- Remove C0 controls other than tab, LF, and CR and remove bidirectional formatting controls from
  report output. Preserve ordinary Unicode.
- Do not render imported Markdown as report structure. It remains inside the Spec fence.
- Test Stub text remains verbatim inside fenced blocks.
- For a historical Test Stub whose referenced state, event, or target no longer exists, print its
  stored id and the fixed marker `Deleted from current machine`; never omit the stub or dereference
  it without a fallback.

### JSON project

- Serialize the exact version 1 shape in section 8.
- Preserve both `activeSpec`, which the results describe, and `draftSpec`, which may contain an
  unsaved next revision.
- Reject export if `activeSpec` is blank, no machine exists, or the snapshot fails the same decoder
  and semantic checks used for import.
- Validate the serialized value through the project decoder before triggering the download. This
  makes the exporter and importer share one trust boundary.

## 10. Privacy and security

- File bytes stay in the browser. No file is stored by State Gap Mapper.
- Text and Markdown content reaches the existing extraction API only after the user chooses
  `Map this spec`, matching pasted content.
- Project restore is local. A later manual `Re-rank` can send the restored machine and Sentences
  through the existing rank endpoint, matching current behavior.
- Treat filenames as display text only. Never inject them as HTML or use them as filesystem paths.
  Route with the raw final extension, but sanitize the displayed name separately: remove C0 and
  bidirectional formatting controls, collapse whitespace, and limit it to 120 code units.
- Do not render imported Markdown or HTML.
- Never send imported content or filenames to analytics, telemetry, exception-reporting, or console
  logging. This release introduces none of those integrations.
- Check byte limits before decoding and collection limits during decoding.
- Reject invalid UTF-8, malformed JSON, unexpected fields, unsupported versions, and semantic
  inconsistencies.
- Never mutate current state until the entire candidate has passed all gates.

## 11. Error copy

| Condition | User-facing copy |
| --- | --- |
| Unsupported extension | `Choose a .txt, .md, .markdown, or State Gap Mapper .json file.` |
| Text file over 64 KiB | `The Spec file is too large to import.` |
| Project over 8 MiB | `The project file is too large to open.` |
| Invalid UTF-8 | `This file is not valid UTF-8 text.` |
| Empty Spec | `The imported Spec must contain text.` |
| Spec over 4,000 characters | `The imported Spec must be at most 4,000 characters.` |
| Malformed JSON | `This project file is not valid JSON.` |
| Wrong discriminator | `Choose a project downloaded from State Gap Mapper.` |
| Unsupported version | `This project was created by an unsupported version of State Gap Mapper.` |
| Invalid project content | `This project could not be opened because <path> <reason>` |
| Read failure | `The file could not be read. Try selecting it again.` |
| Export validation failure | `The current project could not be downloaded because its data is invalid.` |
| Browser download failure | `The download could not be started. Try again.` |

Detailed decoder paths are acceptable because this is a developer tool, but imported values and
browser exception text must not be echoed into the message.

## 12. Accessibility requirements

- `Import` and `Export` are native buttons in the tab order.
- The hidden file input has a programmatic label and is activated by `Import`.
- Export action-panel state is exposed with `aria-expanded` and `aria-controls`. It is a disclosure
  containing native buttons, not an ARIA `menu`.
- Tab, Shift+Tab, Enter, Space, and Escape are required.
- Focus starts on the first enabled download action. Escape dismisses the panel and returns focus;
  moving focus outside dismisses it without trapping the user.
- Confirmation uses the existing accessible dialog pattern, restores focus, and supports Escape.
- Errors use `role="alert"`; success and completion copy uses `role="status"` with
  `aria-live="polite"`.
- Supported formats and size limits are available as visible helper text or accessible
  description, not only in the native picker filter.
- No status relies on color alone.

## 13. Implementation boundary

Suggested file ownership:

| File | Responsibility |
| --- | --- |
| `lib/projectFile.ts` | Project types, strict decoder, semantic checks, serializer, hydration candidate |
| `lib/report.ts` | Pure deterministic Markdown report renderer |
| `src/fileTransfer.ts` | UTF-8 file read and browser download adapter |
| `src/components/FileActions.tsx` | Import input, Export action panel, confirmations, feedback |
| `src/components/SpecPane.tsx` | Open the editor for imported or restored draft content |
| `src/store.ts` | Atomic project hydration action and existing replacement/race invariants |
| `src/App.tsx` | Header action placement |
| `src/index.css` | Quiet action group, action panel, status, and responsive styling |

The serverless API does not change. No runtime package is required.

## 14. Verification and acceptance criteria

### Unit contracts

- Strict project decoder accepts committed golden version 1 fixtures and rejects null roots, arrays,
  missing fields, extra fields, wrong primitives, oversize collections, invalid timestamps,
  invalid versions, invalid evidence, duplicate decisions, and malformed machines.
- Golden version 1 fixtures remain readable after any future general decoder or Sentence-splitter
  change.
- `serializeProject` followed by decode and hydration preserves every non-derived project field,
  including a draft different from the active Spec and the dirty replacement guard.
- A synthetic worst-case project using maximum collection and string bounds, including characters
  that JSON escapes as six bytes, encodes below 8 MiB, exports, imports, and hydrates; 8 MiB plus one
  byte is rejected before parse or download.
- Hydration recomputes exact Structural Gaps from the imported machine.
- Fabricated and duplicate rank pairs cannot change the authoritative Missing Transition set.
- Imported dismissals and accepted-suggestion provenance retain defined-then-reappearing behavior.
- Markdown generation is deterministic for a fixed clock and snapshot.
- Markdown context encoders are tested against pipes, backslashes, CR/LF, every Markdown link and
  image form, autolinks, HTML, headings, backtick and tilde runs, C0 controls, bidirectional controls,
  and hostile values in every dynamic field.
- Historical Test Stubs render stable deleted-reference markers instead of crashing or disappearing.
- File readers reject unsupported extensions, oversize files, invalid UTF-8, empty Specs, and
  4,001-code-unit Specs without mutating state. Boundary fixtures cover BOM, LF, CRLF, lone CR,
  astral characters, and the exact 4,000-code-unit limit before and after textarea editing.
- Download adapter sets the exact MIME type and filename, appends/removes its anchor, revokes its
  object URL on a later task, and reports activation rather than operating-system completion.

### Store and race contracts

- Text import changes only the draft/editor state and makes zero client calls.
- Project restore makes zero client calls.
- Project restore increments the session revision before a late extraction or ranking response can
  land.
- Project restore advances all three async guards and proves that late extract and rank success,
  rejection, and `finally` completions cannot change restored state.
- Slow file A followed by fast file B, overlapping confirmations, picker cancellation, and stale
  read/decode errors all obey `importSeq`; only the latest attempt can report or apply.
- Invalid or cancelled imports preserve the complete previous store state.
- The replacement-confirmation matrix is explicit and tested: text import prompts only for a
  differing unsaved draft; project import prompts when either a non-empty draft or machine exists;
  invalid candidates never prompt; cancelling either confirmation preserves the complete prior
  state; confirming applies only the still-current `importSeq` candidate.
- Confirmed project restore is one atomic store update.
- Text import preserves the current mapped machine until the user explicitly maps the new draft.
- Mapping an imported Spec after canvas edits uses the existing dirty replacement guard.

### UI contracts

- Import helper text names all four accepted extensions.
- Selecting `.txt`, `.md`, or `.markdown` opens the editor with exact content.
- Selecting valid `.json` restores the canvas, gap list, dismissals, suggestions, and Test Stubs.
- A project whose draft differs from its active Spec reopens the editor and explains that the draft
  has not been mapped.
- Export is disabled with no machine and while extraction or ranking is pending.
- Both download actions produce non-empty files with their specified filenames and MIME types.
- All new actions, panels, dialogs, errors, and status messages are keyboard and screen-reader
  operable.
- Import and project restore produce no network request, analytics event, telemetry event, exception
  payload, or console output containing the filename or file contents. Browser verification inspects
  the network and console, not only mocked client calls.
- Existing redline, amber, canvas, gap, sample, acceptance, and Test Stub behavior remains
  unchanged.

### Required implementation gate

```bash
npm run typecheck
npm test
npm run lint
npm run build
npx fallow --changed
```

Behavioral verification must also cover a browser round trip:

1. Map a Spec and wait for non-empty ranks and Suggested Events.
2. Accept a Suggested Event, accept one Missing Transition, dismiss another, make one canvas edit,
   retain one remembered dismissal for a now-defined pair, and create an unmapped draft different
   from the active Spec.
3. Include one historical Test Stub whose referenced machine element was later deleted, then
   download both formats.
4. Open the JSON project in a fresh page and compare every serialized field, including
   `rankTruncated`, both Spec values, the dirty guard, accepted-suggestion provenance, current and
   remembered dismissals, and historical Test Stubs.
5. Confirm that Structural Gaps and coverage were recomputed, presentation layout was regenerated,
   and no LLM or other network request occurred.
6. Open the Markdown report and confirm that the same current facts and user decisions are
   represented with safe deleted-reference markers.
7. Repeat import failure and concurrency cases and confirm there are no console errors, content
   leaks, stale messages, or lost state.

## 15. Done means

The feature is complete only when a user can import a supported Spec file, deliberately map it,
download both result formats, restore the JSON into a fresh session with no LLM call, and observe
the same validated logical project state with Structural Gaps recomputed from the machine and
presentation layout regenerated. Unsupported, oversized, stale, or corrupt input must fail without
changing current work.
