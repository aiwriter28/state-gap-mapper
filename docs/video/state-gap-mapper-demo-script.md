# State Gap Mapper canonical demo voiceover

Feature specs usually describe the happy path. The costly questions arrive later: what happens when an event occurs in the wrong state, and can anyone trace the answer back to the spec?

State Gap Mapper turns that ambiguity into a reviewable state machine. Paste behavioral prose, or load one of the cached demo specs. The samples work instantly and offline, so the core product is always demonstrable.

Here is an order checkout flow. GPT-5.6 extracts states, events, transitions, and sentence evidence. The canvas appears immediately. Then deterministic TypeScript computes the complete state-by-event matrix, so the model can rank gaps, but it can never invent or hide a structural hole.

The top redline is processing by cancel. Cancellation exists from Cart, but the specification never says what happens while payment is processing. Sentences two and five are attached as evidence, making the finding explainable instead of mysterious.

Accepting a gap is a product decision, not an automatic rewrite. I choose Cancelled as the intended target. The mapper adds the edge, marks it as added by me, updates coverage, and drafts a copy-ready Given-When-Then test stub.

The account-signup sample shows the second tier: a suggested event. GPT-5.6 notices that verification codes often expire, with ninety-four percent confidence. Accepting code expired adds it to the event set, and deterministic analysis immediately surfaces exactly three new missing transitions.

Canvas edits are live too. I define verification-code-expired from Unverified back to Unverified. No model call is required; validation runs first, the graph updates, and the gap count drops from eleven to ten.

That boundary is the product's honesty model: GPT-5.6 handles semantic extraction, ranking, rationales, target suggestions, and creative event suggestions. TypeScript owns runtime decoding, validation, structural detection, evidence composition, coverage changes, and test-stub generation. The AI adds judgment; deterministic code protects completeness.

I built State Gap Mapper with Codex as the implementation partner: translating product decisions and architecture records into the domain model, tests, interface, production hardening, deployment, and this Remotion demo. Codex helped trace failures, challenge assumptions, and verify the real production flow, not just produce code.

The result is a fast engineering review loop: prose in, missing behavior redlined, evidence attached, and testable decisions out. State Gap Mapper.

Voice: ElevenLabs voice `u4HtmbcjVZVpiJLQ2GZn` with `eleven_multilingual_v2` and professional narration settings. The original 150.42-second take is retained as `narration-demo-raw.mp3`. The canonical composition uses only `narration-demo-paced.mp3`, which preserves the natural-speed performance and adds 5.6 seconds of silence at paragraph boundaries for a 156.02-second narration track inside the 165-second video. The former 1.08× timing fit remains as the archival file `narration-demo.mp3`; no second paid generation was used.
