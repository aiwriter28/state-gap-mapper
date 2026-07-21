# State Gap Mapper Public Repository Storytelling Plan

**Goal:** Make the public GitHub repository understandable to a semi-technical or non-technical visitor within 30 seconds, while preserving the technical evidence needed by judges and contributors.

**Principle:** Present the product in layers. Lead with the problem, a concrete example, the visual transformation, and a live action. Put architecture, implementation detail, and repository internals later.

## Phase 1: Visual README foundation

**Outcome:** The repository README becomes a current, plain-English product tour backed by authentic visuals.

### Deliverables

- Rewrite the README opening around the user problem and payoff.
- Add a purpose-built visual overview showing Spec -> missing behavior -> human decision -> test-ready output.
- Replace the two nearly identical screenshot sequence with a clearer visual walkthrough and one authentic production workspace capture.
- Explain Structural Gaps, Suggested Events, Evidence, Accept, Dismiss, and Test Stubs without assuming state-machine vocabulary.
- Add current Import and Export behavior, including Spec files, Markdown reports, and JSON project files.
- State the AI and deterministic-code boundary, privacy behavior, scope, and limitations plainly.
- Keep local setup, architecture references, and Codex collaboration as progressive technical detail.
- Prepare a 1280 x 640 social-preview image for later upload to GitHub.

### Acceptance evidence

- A new visitor can answer: what problem it solves, what goes in, what comes out, what the colors mean, what AI controls, what remains deterministic, and how to try it.
- Every interface screenshot comes from the current production application.
- Visual text remains readable when the README is rendered at GitHub width.
- README image links and all local Markdown links resolve.
- Social preview is a PNG under 1 MB at 1280 x 640.

## Phase 2: Public metadata and media publishing

**Outcome:** The repository communicates clearly before a visitor reaches the README.

### Deliverables

- Upload the prepared custom social preview in GitHub repository settings.
- Set the About website field to the live application.
- Add focused topics such as `developer-tools`, `state-machines`, `specification`, `testing`, `gpt-5-6`, `react`, and `typescript`.
- Upload the canonical 2:45 demo to YouTube and replace the reproduction-first CTA with a watch-first CTA.
- Replace submission-in-progress wording with the actual final state.
- Choose and add a license, or state clearly that the public source remains unlicensed.

### Gate

This phase changes public GitHub metadata and publishes external media. Verify the target repository, account, video, links, and final wording immediately before each action.

## Phase 3: Deeper user documentation and repository cleanup

**Outcome:** Visitors can learn the product without navigating internal planning material, while contributors can still find the full engineering record.

### Deliverables

- Add a dedicated visual user guide for detailed workflows and file import/export.
- Point the live application's Docs link directly to the user guide.
- Group internal hackathon, planning, research, and design-decision artifacts under a clearly labeled documentation hierarchy.
- Preserve canonical continuation paths or add redirects when moving binding project files.
- Add a versioned release with a concise human-readable changelog.

## Phase 4: Freshness and maintenance

**Outcome:** Public visuals and claims remain synchronized with the product.

### Deliverables

- Add a lightweight release checklist covering README claims, screenshots, live links, social preview, and status copy.
- Re-capture production visuals after meaningful interface changes.
- Keep the README tour concise; move expanding technical detail into linked documents.
- Review accessibility of image alt text, captions, contrast, and text size on each update.

## Visual-source policy

- Use authentic production captures for interface facts and workflows.
- Use native SVG or the existing Remotion design system for diagrams and exact text.
- Use GPT Image 2 only for optional atmospheric or metaphorical artwork. Do not use generated imagery to represent exact interface state, labels, or product behavior.
