# Evidence is sentence indices, not character offsets or quoted strings

The Spec is split into numbered Sentences client-side before extraction, and the extraction prompt receives the numbered list. Every extracted state, event, and transition must return Evidence as an array of Sentence numbers; the JSON schema enforces the field and index-range validation is mechanical. Clicking a gap highlights its Evidence Sentences in the spec pane.

## Why

Character offsets would allow precise sub-sentence highlighting, but LLMs are unreliable at producing them and there is no cheap way to verify a wrong offset. Quoted substrings drift from the source text (paraphrase, whitespace) and need fuzzy matching. Sentence indices are the coarsest anchor that is still demo-legible, and the only one that is trivially validatable, an out-of-range index is caught by the same validation pass as the rest of the schema, feeding the self-healing retry loop instead of rendering a broken link.

## Consequences

- A Missing Transition's Evidence is composite: the Sentences establishing the state plus the Sentences establishing the event, the display writes the gap as "defined here, defined there, never connected."
- User-added canvas elements have no Evidence and are labeled "added by you"; Suggested Events have none by definition ("not mentioned in the spec" is the display).
- Sentence splitting must be deterministic and stable across re-renders, so it happens once at paste time and the numbered list is the canonical form.
