# DialogLingo v1 Follow-up TODO

This document tracks scoped follow-up plans after the candidate mining + preclean/tool-noise slice.

## Export Manifest and Fields

- Add workbook id, source platform summary, selected item counts, included item types, and generated file list to `manifest.json`.
- Add complete note fields for expression/sentence text bundles, including current snapshot fields and source provenance where useful.
- Add README/import guidance to text bundles so users can understand generated files without inspecting code.
- Keep existing flagged-item export policy behavior intact.

## Settings UI Real-backed Fields

- Expose settings that already have runtime meaning first: `maxItemsPerSession`, `typeBalanceProfile`, scan-on-launch/include-archived behavior, and privacy/export policy controls.
- Do not expose `boundedConcurrency` until generation actually schedules concurrent model batches.
- Preserve current provider/backend and expression difficulty behavior.

## Checkpoint Persistence

- Implement auditable persistence before full resume: write `generation_job_sessions`, `candidate_groups`, `enrichment_batches`, and `ranked_orders`.
- Keep failed/cancelled diagnostics tied to the persisted checkpoint stage.
- Treat true checkpoint resume as a separate follow-up once persisted artifacts are reliable.

## Search Preview Code/Log Collapse

- Collapse code/log/tool-noise-heavy turns in search preview rendering without removing raw search index text.
- Preserve query highlighting and source-span navigation semantics.
- Keep this separate from generation pre-cleaning so search recall does not regress.
