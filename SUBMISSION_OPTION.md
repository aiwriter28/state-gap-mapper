# Submission Plan — Option 2 (chosen direction)

> Decided 2026-07-18. Deadline: **Jul 21, 5:00pm PT** (~3 days). Track target: **Apps for Your Life** (or Dev Tools, TBD).

---

## The decision: fresh, narrow, 100% Codex build from scratch

Build a **new, self-contained tool this week, entirely in a single Codex + GPT-5.6 session**, reusing
lessons from CatchUp but NOT the CatchUp codebase.

### Why this over extending CatchUp

CatchUp is a real, complete product (Expo + Vite PWA + Convex + Twilio + Clerk, 95 commits) that YOU
built via Codex CLI — but it **does not qualify as-is** and is the wrong shape for this contest:

- **Timing:** every commit predates the window (last commit May 27, 2026; nothing on/after Jul 13).
  Rules: pre-existing projects are "evaluated **only on work added during the Submission Period**." → zero in-window work = nothing to judge.
- **Session-ID friction:** submission requires a Codex Session ID "where the **majority of core
  functionality** was built." CatchUp's core was built months ago → awkward / a strike for a mostly-pre-built entry.
- **Judging pattern:** judges reward a **narrow, legible "aha" demo built in the window**, not "here's my big existing app."

A clean-slate build sidesteps all of that: clean Session ID, no old-vs-new documentation burden, and a
from-scratch in-window build reads far better on **Technological Implementation** (25% of score).

### What Option 2 wins

- Clean qualification — no pre-existing-project caveats.
- One clean Codex Session ID covering the majority of core functionality (exactly what's required).
- Authentic "how you used Codex" narrative (you already run a Codex-driven workflow: AGENTS.md, plan-review, branches).
- Freedom to pick something **small enough to finish and polish** in 3 days.

---

## Guardrails for whatever we build

From the rules + past-winner lessons (see `HACKATHON.md`, `PAST_WINNERS.md`):

1. **Narrow and complete beats broad and broken.** One sharp feature, one obvious "aha".
2. **Legible demo:** input → visible result → clean UI, understandable by a judge in ~30 seconds. Video < 3 min.
3. **Codex is the center of gravity:** do the core build in ONE Codex + GPT-5.6 session; keep it clean; capture the Session ID.
4. **GPT-5.6 specifically** — use current Codex/GPT-5.6, not older models.
5. **README** must narrate where Codex accelerated the work and where the human made key decisions.
6. **Testable by judges** free until judging ends (public repo or share with testing@devpost.com + build-week-event@openai.com).

---

## Open decisions — RESOLVED 2026-07-18 (see `STATE_GAP_MAPPER.md`)

- [x] Track: **Developer Tools**.
- [x] Idea: **State Gap Mapper** — spec linter; aha = "it found the edge case your spec forgot."
- [x] Stack: TS/React/Vite + React Flow + GPT-5.6 structured outputs, deploy to Vercel.
- [ ] Write the implementation plan (new session, engineering OS skill), then build in one clean
      Codex + GPT-5.6 session. Full decision record + panel evidence: `STATE_GAP_MAPPER.md`.

## Reference: what CatchUp is (for idea reuse, NOT code reuse)
Two-sided meetup scheduling: organizer creates flexible hangout → invitees get SMS link → respond via
zero-install PWA on an availability heatmap → quorum/auto-confirm. Real problem, real audience. Any new
build can borrow the "coordination without the back-and-forth" theme without touching the old repo.
