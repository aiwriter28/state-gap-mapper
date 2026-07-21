# State Gap Mapper demo video

This directory is the single source of truth for the State Gap Mapper video: a reproducible 2:45 Remotion composition built from verified production captures. It covers the product flow, suggestion cascade, live recomputation, GPT-5.6/TypeScript boundary, and Codex collaboration story. Focal camera moves pair each callout with a readable close-up instead of leaving the viewer on a static full-interface frame.

[Watch the published demo on YouTube](https://youtu.be/-kOouhl8B78).

## Canonical manifest

| Role | Canonical file |
| --- | --- |
| Editable composition and timing | `src/Composition.tsx` |
| Narration used by the composition | `public/audio/narration-demo-paced.mp3` |
| Final shareable render | `out/state-gap-mapper-demo.mp4` |
| Approved voiceover | `../docs/video/state-gap-mapper-demo-script.md` |
| Approved visual sequence | `../docs/video/state-gap-mapper-demo-outline.md` |

The composition ID is `StateGapMapperDemo`. Only the paced narration track participates in the final render. `narration-demo-raw.mp3` and `narration-demo.mp3` are retained as archival source variants and are not current outputs.

## Commands

```console
npm install
npm run dev
npm run render
```

The render command always writes the canonical output, `out/state-gap-mapper-demo.mp4`: exactly 2:45 at 1920×1080, 30 fps, H.264/AAC. Do not create or distribute alternate filenames from this directory.

The video uses eight authentic captures from the deployed application. Narration uses ElevenLabs voice `u4HtmbcjVZVpiJLQ2GZn`; the composition uses the natural-speed take with 5.6 seconds of paragraph-level breathing room added locally. The original, former 1.08× timing fit, and current paced track are retained under `public/audio/`.
