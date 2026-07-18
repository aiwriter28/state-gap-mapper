# OpenAI Build Week — Hackathon Notes

> Source: https://openai.devpost.com/rules (read in full 2026-07-18)
> Status: **Registered.** Deadline is tight — see timeline.

---

## What this is

**OpenAI Build Week** — a global online hackathon run by OpenAI (Sponsor) and Devpost (Administrator).
Build a project with **Codex + GPT-5.6** that fits one of four tracks. $100K in prizes across the tracks.

This is a rotating OpenAI/Devpost event. The prior edition was the **Open Model Hackathon** (gpt-oss,
Aug–Sep 2025, ~8,651 participants, $30K + NVIDIA GPUs) — so it's a legit, well-run event with real winners.

---

## Timeline (all Pacific Time)

| Phase | Window |
|-------|--------|
| Registration | Jul 9 (10am) – Jul 21 (5pm) |
| **Submission** | Jul 13 (9am) – **Jul 21, 5:00pm PT** ← hard deadline |
| Judging | Jul 22 (10am) – Aug 5 (5pm) |
| Winners announced | ~Aug 12 (2pm) |
| Free-credit request form | Due **Jul 17, 12pm PT** (likely closed) |

**As of Jul 18, ~3 days left.** Build narrow and polished, not broad and broken.

---

## Tracks (pick one)

1. **Apps for Your Life** — consumer: productivity, creativity, home, family, travel, health, personal finance.
2. **Work and Productivity** — team tools: workflow automation, support, analytics, sales, back-office.
3. **Developer Tools** — testing, DevOps, agentic workflows, security, agent plugins (skills/MCPs/tools).
4. **Education** — help students, teachers, or educational orgs.

---

## The Codex question (KEY)

**Can I use Claude Code too, or is it Codex-only?**

- **Nothing in the rules bans other tools.** No exclusivity clause. Claude Code / Cursor / anything is fine.
- **BUT Codex must be the center of gravity**, locked in by three clauses:
  1. **Binding requirement:** must provide a **Codex Session ID for the thread where the MAJORITY of core
     functionality was built.** So the bulk of the real build must live in a Codex session you can point to.
  2. **Judging:** "Technological Implementation" = *how thoroughly and skillfully does the project use Codex?*
     — one of four equally weighted criteria (25% of score).
  3. **Narrative:** README must describe Codex collaboration; demo video must cover how you used Codex + GPT-5.6.

**Practical rule:** Use Claude Code freely for planning, research, review, scaffolding. Drive the actual
core build through Codex + GPT-5.6. Keep that Codex session substantial and clean. Commit history + session
logs should show Codex did the heavy lifting.

---

## Submission checklist

- [ ] Working project (installs + runs as shown), built with Codex + GPT-5.6
- [ ] Category selected
- [ ] Text description (features + functionality)
- [ ] **Demo video < 3 min**, public on **YouTube**, audio covering what you built + how you used Codex/GPT-5.6
- [ ] Repo URL — public, OR private + shared with `testing@devpost.com` and `build-week-event@openai.com`
- [ ] README describing Codex collaboration (where it accelerated you, key decisions)
- [ ] **Codex Session ID** for the core-functionality thread
- [ ] Plugins/dev tools: install instructions, supported platforms, testable instance (demo/sandbox/test account)
- [ ] Judges can test it free until judging ends
- [ ] English (or provide translations)

---

## New vs. existing projects

Both allowed. A pre-existing project must be **meaningfully extended during the submission window** using
Codex/GPT-5.6, and is judged **only on the new work**. Must document old-vs-new with evidence (timestamped
Codex logs, dated commits).

---

## Judging

- **Stage 1 (pass/fail):** fits the theme + actually uses the required tools.
- **Stage 2 (four equally weighted criteria):**
  1. **Technological Implementation** — thorough, skillful Codex use; non-trivial working implementation.
  2. **Design** — complete, coherent product experience (not just a POC).
  3. **Potential Impact** — credible, specific case for a real problem + real audience.
  4. **Quality of the Idea** — creative, novel, differentiated.

---

## Prizes (per track)

| Place | Prize |
|-------|-------|
| 1st | $15,000 + up to 2 DevDay passes ($650 ea) + Meet the Codex Team + OpenAI promo + 1yr Pro |
| 2nd | $10,000 + OpenAI promo + 1yr Pro |

One prize per project. Travel to DevDay (Sep 29, 2026, SF) is self-funded. Winners handle their own taxes.

---

## Eligibility gotchas

- Age of majority; must reside in an OpenAI-API-supported country.
- **Excluded:** Brazil, Quebec, Russia, Crimea, Cuba, Iran, North Korea, Syria + other OFAC-sanctioned regions.
- Teams appoint one Representative. OpenAI/Devpost employees, judges, and their households are out.

## Other notes

- **Multiple submissions** allowed, but each must be substantially different.
- **IP:** you keep all rights; OpenAI/Devpost get a non-exclusive license to use/promote for up to 3 years.
- **Devpost Plugin** (optional, runs inside Codex): AI output may be inaccurate — the Official Rules govern, not the plugin.
- Overage charges beyond free credits are your responsibility.
