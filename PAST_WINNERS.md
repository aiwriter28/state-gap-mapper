# Past Winners — Examples & Lessons

> Source: Devpost project pages + community posts (researched 2026-07-18).
> **Caveat:** These are from the *previous* edition — the **Open Model Hackathon** (gpt-oss open
> weights, Sep 2025), which was robotics/hardware themed. **Build Week (yours) is Codex-on-software.**
> So treat these as pattern lessons, not templates. No robot arms in your event.

---

## Confirmed winners (Open Model Hackathon, Sep 2025)

### 🏆 RoboChef — Best Overall ($10,000, sponsored by Hugging Face)
- **What:** GPT-OSS-powered robotic kitchen assistant.
- **Flow:** natural language ("make me a pineapple smoothie") → GPT-OSS decomposes into steps
  ("open cabinet", "pick up pineapple") → drives an **SO-100 robotic arm** via **NVIDIA Isaac GR00T**
  → **live UI** shows kitchen state + current action + what's next.
- **Notable:** ran entirely **locally on a single RTX 4090** (no cloud). Fine-tuned Isaac GR00T to
  their robot via teleoperation-collected data.
- **Team:** Voic Andrei, Alexandru Luci + team.
- **Link:** https://devpost.com/software/robochef-gpt-oss-powered-kitchen-assistant

### 🏆 Malek Gharsallah (ESPRIT, Tunisia) — won TWO tracks
- Only competitor to double-win.
- One first-place project: **Synapse** — a rainwater-harvesting ecosystem.
- (Second project + other details not cleanly public.)

### Categories that existed (7)
Best Overall · Best in Robotics · Weirdest Hardware · Best Local Agent (offline) ·
Most Useful Fine-Tune · Wildcard · For Humanity.

### Gaps
Devpost never cleanly published the full per-category winner list; winners for Robotics / Hardware /
Local Agent / Fine-Tune / Wildcard / For Humanity are unverified. The site now redirects to Build Week.
(Separate event: the Kaggle **gpt-oss-20b red-teaming challenge** DID publish a named top-10, e.g. Holistic AI.)

---

## The transferable lesson (this is the point)

**Best Overall wasn't the most technically dense entry — it was the most legible "wow" demo.**
Pattern: **natural-language input → visible real-world action → clean live UI.** A judge understood
it in ~30 seconds.

That maps directly onto Build Week's four equally weighted criteria:
- **Technological Implementation** — Codex visibly did the heavy lifting.
- **Design** — complete, coherent product experience (RoboChef's live UI), not a POC.
- **Potential Impact** — a real, specific use case.
- **Quality of Idea** — a novel, memorable hook.

### What this means for a Codex/software entry
- Pick something **narrow and complete** over broad and half-built.
- Engineer one obvious **"aha" moment** the judge gets instantly on video.
- Make the **Codex session** the clear source of core functionality (it's 25% of score + the required Session ID).
- A polished single-feature app beats an ambitious broken one. Every time in these rubrics.
