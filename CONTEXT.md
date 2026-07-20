# State Gap Mapper

A spec linter: extracts a state machine from a plain-English feature spec and flags what the spec forgot to define. The diagram is the display surface; the gap analysis is the product.

## Language

### Spec

**Spec**:
The plain-English feature description the user pastes in. Split into numbered Sentences before extraction.
_Avoid_: prompt, description, input text

**Sentence**:
One numbered unit of the Spec. The atomic anchor for all Evidence.

**Evidence**:
The set of Sentence numbers that establish an extracted state, event, or transition. Every extracted element must carry Evidence; elements the user adds by hand carry none and say so.
_Avoid_: source, citation, reference

### Gaps

**Structural Gap**:
A defect computed deterministically by graph analysis over the extracted state machine. Never produced by an LLM; needs no confidence score.
_Avoid_: detected gap, real gap, error

**Missing Transition**:
A Structural Gap where an event is handled in at least one state but has no defined transition in another state. Every such hole is enumerated deterministically; Relevance decides display order, never existence.

**Unreachable State**:
A Structural Gap where a state has no path from the initial state.

**Dead-End State**:
A Structural Gap where a non-final state has no outgoing transitions.
_Avoid_: trap state, sink

**Relevance**:
An LLM-assigned rank on a Missing Transition: how likely the undefined pair is an oversight rather than an intentional non-transition. Comes with a one-line rationale. Orders the gap list; never hides or invents a hole.
_Avoid_: confidence (reserved for Suggested Events), score

**Confidence**:
An LLM-assigned score on a Suggested Event: how likely the event genuinely belongs in this feature at all.
_Avoid_: relevance (reserved for Missing Transitions)

**Suggested Event**:
An event the Spec never mentions, proposed by the LLM as plausibly relevant (cancel, timeout, failure). Always carries a Confidence score, renders visually distinct from Structural Gaps, and is framed as a suggestion, never a finding. Has no Evidence by definition; that absence is the point.
_Avoid_: semantic gap, AI gap

### Resolving gaps

**Accept**:
The user's decision that a gap is real. Accepting a Missing Transition drafts the transition onto the canvas and produces a Test Stub. Accepting a Suggested Event adds the event to the machine, which re-runs structural analysis.

**Dismiss**:
The user's decision that an undefined state/event pair is intentional. Dismissed pairs leave the gap list and the gap count but remain visible in the full matrix.
_Avoid_: reject, ignore

**Test Stub**:
A Given/When/Then test skeleton generated from an Accepted gap, citing its Evidence. Generated from a template, not by the LLM.
_Avoid_: test case (it has no expected outcome until a human writes one)

### Files

**Spec File**:
A local `.txt`, `.md`, or `.markdown` file containing only a Spec. Importing it fills the Spec draft; it is not mapped until the user chooses to do so.
_Avoid_: upload (the file is not stored remotely)

**Project File**:
A versioned State Gap Mapper `.json` snapshot used to restore the validated logical project state. Structural Gaps are recomputed from the restored machine; presentation layout is regenerated.
_Avoid_: generic JSON, exported analysis

**Report**:
A deterministic `.md` download for people and downstream documentation. It is not a restoration format.
