# Production Release and Live Verification Report

## Release destination

- Integrated `feature/state-gap-mapper-build` into local `main` at merge commit `f155dec`.
- Linked and deployed the existing Vercel project `erics-projects-514479e9/state-gap-mapper-build`.
- Canonical production URL: `https://state-gap-mapper-build.vercel.app`.
- Final production deployment: `dpl_5WMqU4Ct9iGJk9gvqLqKC71sqiSi`, status `READY`.
- Public repository: `https://github.com/aiwriter28/state-gap-mapper`, visibility `PUBLIC`, default branch `main`.

## Production defect and recovery

- The first deployment exposed a production-only failure: Node 24 could not resolve extensionless
  ESM imports from the transpiled `/api/llm` function (`ERR_MODULE_NOT_FOUND` for `lib/budget`).
- The blast radius was the live model path. Static UI and all three cached samples remained usable.
- Added `tests/server-esm-imports.test.ts`, watched it fail on all extensionless `api/` and `lib/`
  imports, then changed the shared server graph to explicit `.js` specifiers.
- Rebuilt with `vercel build --prod`; importing the exact generated function artifact returned
  `PRODUCTION_FUNCTION_IMPORT_OK` under Node 24.
- Deployed that prebuilt production artifact. The canonical alias now targets the repaired
  deployment, and its recent log query contains no 5xx entries.

## Gates

- `npm run typecheck`: passed.
- `npm test -- --exclude '.worktrees/**'`: 18 files, 211 tests passed.
- `npm run lint`: passed.
- `npm run build`: passed; the existing over-500 kB bundle warning remains advisory.
- `npx vercel build --prod --yes`: passed.
- Fallow audit against the pre-fix release commit: `pass`, zero dead-code issues.
- `npm audit --omit=dev`: zero production vulnerabilities.

## Live production evidence (`?bust=1`)

- Canonical page: HTTP 200 in 0.317 seconds.
- Cached Sample 1: 281 ms, 10 gaps, top gap `processing x cancel`, six of six sentences mapped.
- Cached Sample 2: 285 ms, 10 gaps, top gap `approved x request_changes`, six of six sentences mapped.
- Cached Sample 3: 295 ms, eight gaps, `code_expired` suggestion present, five of five sentences mapped.
- The browser recorded zero `/api/` resources across all three sample selections, confirming the
  shipped static caches serve the offline-capable path.
- Novel support-ticket spec: direct production extraction returned HTTP 200 in 14.906 seconds;
  the UI rendered the five-state canvas within 18.641 seconds and completed non-blocking ranking
  at 34.391 seconds.
- Garbage recipe/filler input: friendly viability refusal in 5.425 seconds; the previous machine
  remained intact.
- Browser console: zero warnings and errors during the checked states.
- Rate limiting remains covered by handler tests per the plan; no live 429 gate was performed.

## Screenshots

- `design-samples/verification/production-empty-1536.png`
- `design-samples/verification/production-order-1536.png`
- `design-samples/verification/production-novel-1536.png`
