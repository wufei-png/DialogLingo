# DialogLingo v1 Design

## Objective

Build `DialogLingo` as a local-first cross-platform desktop app that turns agent chat sessions into English-learning workbooks for review and export, then exports them primarily to Anki and secondarily to simple text bundle formats.

This v1 is not a general transcript browser, not a provider router, and not a long-term learning tracker. Its job is:

`local sessions -> selection -> generation -> review workbook -> export`

## Product Frame

DialogLingo is a standalone desktop app for macOS, Windows, and Linux. It should feel visually adjacent to Codex Desktop: light white/gray surfaces, restrained motion, and selective glass/translucent treatment on chrome and modal surfaces rather than dense list content.

The product is a review-and-export console for learning material derived from daily AI conversations. Users do not study inside DialogLingo long-term. They generate a workbook, optionally clean it up, then export it to Anki or text formats for downstream learning tools.

## Goals

- Auto-discover local sessions from `Codex`, `Claude Code`, and `OpenCode`.
- Auto-discover projects/workspaces from those sessions.
- Let users filter by `Time range`, `Platform`, and `Project`.
- Let users select sessions in bulk and by group.
- Generate two workbook item types: `Expression` and `Sentence`.
- Support mixed-language conversations. If source content is Chinese, the system may generate the English-side learning material; if source content is English, the system may generate the Chinese-side support material.
- Present generated items in a review workbook before export.
- Support edit, delete, restore, revert, and autosaved workbook drafts.
- Export Anki-first, with reliable text-bundle fallbacks.
- Reuse existing ecosystem pieces where practical instead of rebuilding them.

## Non-Goals

- No cloud sync, hosted account system, or team collaboration.
- No in-app spaced repetition history or mastery tracking.
- No public plugin marketplace in v1.
- No universal transcript parser that pretends all sources are identical.
- No broad provider-router surface in v1 beyond one OpenAI-compatible API endpoint and the supported local CLI backends.
- No broad global undo system across search, selection, generation, and export.
- No full workspace-admin product inside the main search flow.

## Recommended Stack

Recommend:

- Desktop shell: `Electron`
- Scaffold/build: `electron-vite`
- UI: `React + TypeScript` with strict mode
- UI state: `Zustand`
- Async data/job state: `TanStack Query` + typed job event subscription
- Tables/lists: `TanStack Table` + `TanStack Virtual`
- Local database: `SQLite`
- DB driver: `better-sqlite3`, running in Electron `main`, `utilityProcess`, or `worker_threads`, never in `renderer`
- DB schema/migrations: `Drizzle ORM` + checked-in migrations
- Full-text search: `SQLite FTS5`, implemented through raw SQL migrations and query helpers
- IPC: `electron-trpc + Zod`
- Background work: Electron `utilityProcess` / `worker_threads` + typed job events
- Model layer: OpenAI-compatible API by default, optional local Codex/Claude/OpenCode CLI backends, TypeScript structured generation client, and `Zod` validation
- Animation: `Motion for React` layout animations + `AnimatePresence`
- Testing: `Vitest` + fixture-driven adapter/ranking/workbook/export tests

Exact dependency versions and native-module rebuild policy are governed by [Electron stack version decision](../../architecture/2026-06-15-electron-stack-version-decision.md).

Rationale:

- `Electron + electron-vite` prioritize engineering speed plus the Node/TypeScript ecosystem needed for local files, SQLite, transcript ingestion, and export.
- `Zustand` manages local UI intent only: active section, focused session, selected ids, filters, and drawer/modal state.
- `TanStack Query` manages async state only: sessions, session previews, workbook items, and generation-job snapshots.
- `SQLite + better-sqlite3 + Drizzle` are complementary, not substitutes: SQLite is the database, `better-sqlite3` is the Node driver, and `Drizzle` manages schema, normal queries, and checked-in migrations.
- `FTS5` should stay in raw SQL. Full-text search, snippets, highlighting, and ranking should not be forced into the ORM abstraction.
- `electron-trpc + Zod` keep IPC from sprawling into ad hoc channels and give end-to-end type plus runtime validation.
- `utilityProcess / worker_threads` keep scan, normalize, generation, and export work off the renderer and out of the main event loop hot path.
- `Motion` is for explaining state changes, not decorating everything. Use it for section transitions, group-by reorders, and delete/restore transitions only.
- `Vitest` fixture-driven tests are critical because adapters, ranking, workbook behavior, and export mappings are easy for later AI-driven edits to regress.

This recommendation does not prevent a later Tauri migration, but v1 should not split effort across two app-shell strategies.

If `electron-trpc` becomes a concrete packaging or preload blocker, the only acceptable fallback is a small `Zod` schema-driven typed IPC layer. Do not keep both IPC systems in parallel.

## IPC and Background Work

DialogLingo should have one typed desktop boundary:

- renderer calls typed IPC procedures
- typed IPC procedures live behind `electron-trpc + Zod`
- long-running work executes in `utilityProcess` or `worker_threads`
- progress flows back through typed job-event subscription

Do not let renderer code access the database directly. Do not let background work invent a second IPC contract.

Recommended division:

- `renderer`
  - view state
  - query subscriptions
  - job progress display
- `main`
  - window lifecycle
  - IPC router bootstrap
  - orchestration and worker spawning
- `utilityProcess` / `worker_threads`
  - scan
  - normalize
  - candidate mining
  - LLM batches
  - export

## Information Architecture

DialogLingo has two top-level sections only:

1. `Search & Select`
2. `Workbook`

### 2026-06-16 UI repair implementation notes

The current implementation intentionally differs from a few earlier layout notes in this spec.
Use these notes as current implementation context when maintaining the renderer; items called out as open questions in the 2026-06-17 snapshot still need product discussion.

- The section switcher is not a permanent app-wide left sidebar. `Search & Select` and `Workbook` tabs live inside the left pane header and stop at the pane divider.
- The launch intro copy `Local chat to workbook` appears only on the scan/loading screen. It should not reserve space in the main Search or Workbook surfaces.
- Search and Workbook both use the same persisted split-pane ratio. The default is compact left / wide right, `3:7` (`ui.splitRatio = 0.3`), with a draggable divider on both sections.
- Settings is a compact utility reachable from the bottom of the left pane. Its layout control resets the shared split ratio back to `3:7`.
- The current Workbook section defaults to an on-demand source drawer, with an optional pinned split-pane source view. Do not assume a permanently reserved source column unless the user explicitly pins it.
- Search session navigation rows show titles only. Preview/snippet content belongs in the main preview pane, not in the navigation list.
- Platform filtering is a live data filter. Toggling platform checkboxes updates the rendered session groups and removes hidden sessions from the selected set.

### 2026-06-17 Current implementation snapshot and known gaps

Use this section to orient maintenance against the current code. It does not close product questions that still need explicit design discussion.

- Workbook layout now follows the on-demand provenance-panel direction by default. The source panel opens from `View source` as a drawer and can be pinned into a draggable split view; the pinned mode is a user preference rather than the default layout.
- TODO: Workbook keyboard flow is partially implemented. Current cards autosave edited fields on blur, `Esc` resets the current edit buffer, `Cmd/Ctrl+Enter` saves and advances while editing, `Enter` focuses the selected card target field, `j/k` and arrow keys move card selection when not editing, and `Delete/Backspace` moves the selected active card to `Deleted`. Dedicated explicit `Save` / `Cancel` button affordances and more polished focus semantics remain open.
- Search preview follows the current code contract: session navigation rows are title-only, while snippets/highlights belong in the focused preview pane. Empty search should not render transcript literal `<mark>` text as a highlight; preview highlighting is active only when the query is non-empty.
- Workbook source/provenance is no longer just a placeholder. `SourcePanel` shows source platform, project/workspace, timestamp, source-span/text-match status, source-ref navigation, normalized highlighting, and `Prev / Next` match navigation. Optional raw excerpt fallback controls are still planned work.
- Generation docs should describe the current model layer as OpenAI-compatible API plus explicit CLI backends and mock LLM mode. Older references to a dedicated `litellmClient.ts` are historical; LiteLLM remains usable as an OpenAI-compatible local gateway, not as a special provider-router surface.
- Current generation pre-clean uses persisted and heuristic tool-noise signals, redacts obvious API-key-like secrets, drops pure tool/code/log/path/error noise, and strips noisy blocks from otherwise useful natural-language turns before model prompting. Search indexing still keeps raw transcript text; search preview code/log collapse remains follow-up work. See [generation pre-clean and candidate mining](../../architecture/2026-06-18-generation-preclean-candidate-mining.md).
- Current candidate mining splits cleaned natural-language turns into local candidate excerpts, filters trivial/pure fragment/noisy/near-duplicate candidates, and applies `maxItemsPerSession` after filtering. Durable `candidate_groups` persistence is still planned work. Pipeline diagram and module map: [generation pre-clean and candidate mining](../../architecture/2026-06-18-generation-preclean-candidate-mining.md).
- Current generation post-processing performs exact normalized dedup, conservative near-duplicate source-text merging, trivial expression filtering, in-memory heuristic base ranking, and type-balance rerank before workbook materialization. Durable `ranked_orders` checkpoint persistence is still planned work.
- Database docs should be checked against `src/main/db/schema.ts` and migrations before DB work. Current code includes fields/tables such as `sessions.search_text`, `sessions.is_archived`, `workbook_items.source_refs_json`, `candidate_groups`, `enrichment_batches`, and `ranked_orders` that older prose may omit.

### Search & Select

The left side behaves like a Codex-Desktop-style rail plus session tree. The main pane shows the focused session content preview.

#### Left rail structure

- Top nav:
  - `Search & Select`
  - `Workbook`
- Filter header:
  - search box
  - `Time range`
  - `Platform`
  - `Projects`
- List toolbar:
  - `Group by`
  - `Select All in View`
  - `Clear Selection`
- Session tree:
  - grouped session rows
  - group-level bulk actions
  - session-level checkboxes
- Footer:
  - selected session count
  - `Generate Workbook`
  - `Rescan`
  - `Settings`

Do not render six separate visual blocks. The left rail should feel like one compact search-and-selection surface:

- search box
- collapsible filter controls
- list toolbar
- session tree
- footer actions

#### Search & Select defaults

On launch:

- auto-scan local sources
- auto-discover projects from indexed sessions
- default-select all discovered projects
- default `Time range = Last 7 days`
- default-select no sessions
- default `Group by = Platform`
- groups default to collapsed
- the first available session is focused in the main pane

The app must not silently default to generating against the full local corpus.

#### Project behavior

Projects are a filter scope, not a second-stage selection system and not a standalone admin screen.

- default unconfigured state: auto-discovered project list
- users can add local paths manually
- users can remove local paths manually
- selecting a project is itself the confirmation of filtering
- no second checkbox layer inside projects

#### Search UX

Search should query the local indexed corpus, not the currently rendered preview pane.

v1 should support:

- session-title search
- transcript-content search over normalized indexed turns
- a single query box with a small scope selector:
  - `All`
  - `Titles`
  - `Transcript`

Default behavior should search both indexed session metadata and indexed transcript content.

The UI should use FTS-backed snippets/highlights in the focused session preview pane. Session navigation rows remain title-only so preview/snippet content does not crowd the browsing rail.

Search is against the local index only. The preview pane displays the result context; it is not its own search target.

When search is active:

- matching groups auto-expand
- matching sessions surface through the filtered/grouped session tree, while snippet detail stays in the focused preview pane
- the preview pane auto-scrolls to the first visible match
- if the first match is inside a collapsed code/log block, that local block expands before scrolling

If the current query has multiple matches in the focused preview, show lightweight `Prev / Next match` navigation near the preview context area.

#### Grouping behavior

Only one grouping mode may be active at a time:

- `Platform`
- `Time range`
- `Project`

Default grouping is `Platform`.

When grouped by `Time range`, groups are day-granularity and sessions inside a group sort from earlier to later.

Group-by changes should use restrained Motion layout animation on group containers and visible rows only. Session rows must use stable `session.id` keys, never array indexes. If the list is large, animate group headers and visible rows only; do not attempt full-list FLIP animation across thousands of virtualized rows.

Session rows should dynamically compensate for the active grouping mode, but remain compact. In v1, keep each row to:

- primary title
- one secondary text slot
- at most one compact badge

#### Session row interaction

- Clicking a session row focuses preview only.
- Checkbox toggles selection only.

This avoids accidental deselection while browsing and stays closer to the Codex Desktop browsing mental model.

#### Main preview area

The main pane displays the focused session:

- session title
- source platform
- project/workspace path
- timestamps
- normalized conversation preview
- highlighted snippets when relevant

The preview pane is for relevance checking before generation, not full transcript inspection. Code/log blocks should be collapsed by default in preview. Raw transcript excerpts should remain available only as a fallback drill-down, not as the primary reading layer.

Do not add a separate `Highlight Natural Language` toggle in v1. Normalized preview plus default code/log collapsing is the single preview-denoise model.

The `Generate Workbook` action lives in the left-rail footer because selection happens there. Triggering generation opens a lightweight confirmation sheet that shows:

- selected session count
- platform distribution
- project distribution
- generated item types: `Expression + Sentence`

That confirmation sheet should confirm scope and expose the generated model prompt as an editable per-generation draft. The prompt editor should follow workbook-card editing semantics: editable by default, save on blur, visible saved/modified affordances, and revert to the generated prompt.

Large transcript text surfaces should not receive heavy motion treatment. Avoid transcript-scroll animation, heavy table-sort animation, and fake token-stream activity in the preview surface.

### Workbook

The Workbook section has two states.

#### State A: Progress

Show progress only while generation runs:

- progress bar
- sessions processed / total
- current session title
- current stage
- items created
- warnings / failures
- cancel button

Do not show half-built review tables during active generation.

#### State B: Review workbook

After completion, expand into the workbook review surface:

- keep only the global app chrome / section switcher from the Search page
- use a single-line sticky top bar inside the main workbook surface
- left side of the sticky bar:
  - `All`
  - `Expressions`
  - `Sentences`
  - `Deleted`
- center of the sticky bar:
  - workbook statistics
- right side of the sticky bar:
  - `Export`
- main body:
  - virtualized card stream
- auxiliary source view:
  - on-demand right-side provenance panel
  - not a permanent 40% split

Export opens a modal. Export is not its own page.

Workbook items should be loaded through `TanStack Query`, not through ad hoc component-level fetch logic.

The workbook should not reuse the Search page’s heavy left rail. Workbook local controls belong in the sticky top bar above the card stream.

#### Workbook card interaction model

- single click on a card: select it
- `Enter` or explicit field action: begin editing
- `Cmd/Ctrl+Enter`: save and advance to the next item
- `Esc` / `Cancel`: discard the current unsaved edit buffer
- `↑ / ↓` and `j / k`: move selection between cards when not editing
- `Delete / Backspace`: move the selected card to `Deleted` when not editing

Do not use hover-to-edit. Do not let the provenance panel track hover churn.

When a text field is in edit mode, `j / k`, `↑ / ↓`, and deletion keys should behave like normal text-editing keys rather than card-level navigation commands.

#### Editable versus read-only fields

`Source` is read-only in v1.

Editable fields may include:

- `Target`
- `Gloss`
- `Explanation`
- `Quiz`
- `Tags`

This preserves stable provenance anchors for source highlighting and source-position jumps.

Modified cards should show a visible modified indicator plus a lightweight `Revert` affordance. The indicator should be semantic and theme-safe; the spec should not hard-code one exact accent color.

#### Provenance panel

The provenance panel opens on demand from the selected card through a control such as `View source` or `Context`.

It should show:

- source platform
- project/workspace
- timestamp
- source turn/span metadata
- normalized context snippet with highlight
- optional raw excerpt fallback

It should not be a permanently reserved peer column in the default workbook layout.

If the current item’s highlighted source has multiple matches in the provenance snippet, show lightweight `Prev / Next match` navigation there as well.

Do not add same-source card clustering to v1. If later needed, treat it as a follow-up optimization after the core ordering and provenance model prove stable.

## Settings

`Settings` should stay intentionally small in v1.

### Provider

- `OpenAI-compatible base URL`
- `API key`
- `default model`

### Generation

- `default language direction`
- `batch size`
- `bounded concurrency`
- `max items per session`
- `default type-balance profile` for workbook ordering

### Privacy

- `redaction before remote send` on/off
- `flagged item export policy`
  - block
  - warn and require explicit keep

### Scan

- per-platform path overrides
- `scan on launch` on/off
- `include archived sessions` on/off

When `include archived sessions` is off, archived rows may remain in the local SQLite index cache to preserve workbook source references, but archived sessions and archived-only projects must not appear in Search & Select results or default launch selections.

Do not add background periodic scan scheduling to v1 by default. Launch-time scan plus manual `Rescan` is enough.

## UI Motion Policy

Use Motion to explain state transitions, not to decorate static content.

### Good motion targets

- group-by changes that reorder group containers
- session rows moving between groups when the active grouping changes
- selected-count bar updates after bulk selection changes
- `Search & Select` to `Workbook` section transition
- progress state switching into workbook review state
- item delete slide-out / collapse
- item restore reinsertion

### Bad motion targets

- large transcript text scrolling
- continuous layout animation for every row in a large virtualized list
- heavy animation for table column resize or sort
- fake token-stream-style progress animation

### Implementation constraints

- session rows must use stable `session.id` keys, never array indexes
- if a list becomes large, animate group headers and visible rows only
- do not attempt full-list FLIP animation over thousands of virtualized rows

## Source Adapters

DialogLingo owns source normalization. It should not depend on one giant external search product at runtime.

Build explicit per-source adapters:

- `CodexAdapter`
- `ClaudeCodeAdapter`
- `OpenCodeAdapter`

Each adapter exposes:

- `listSessions(filters): SessionSummary[]`
- `readSession(sessionId): ConversationTurn[]`

`ConversationTurn` may include `isToolNoise` when the adapter can classify provider/tool/meta output. The scan layer also applies conservative pure-noise heuristics before persisting `session_turns.is_tool_noise`.

### Reuse policy

Reuse discovery patterns, path knowledge, and official/local APIs where possible:

- Codex transcript paths and available app-server/thread discovery surfaces
- Claude Code session listing/message retrieval surfaces when available
- OpenCode CLI/SDK surfaces rather than scraping storage directly when possible

Do not build a fake universal parser that assumes one shared raw format.

## Local Data Model

DialogLingo persists both indexing state and workbook state locally.

`Drizzle ORM` should manage the regular table schema, checked-in migrations, and ordinary typed queries.

`FTS5` virtual tables, supporting triggers, snippets, highlights, and ranking queries should be created and maintained through raw SQL migrations plus small query helpers. Do not force FTS primitives through the ORM if it hurts clarity.

### Tables

#### `projects`

- `id`
- `name`
- `local_path`
- `source_platforms_json`
- `discovered_at`
- `user_pinned`
- `is_active`

#### `sessions`

- `id`
- `source_type`
- `source_session_id`
- `project_id`
- `title`
- `started_at`
- `updated_at`
- `preview`
- `raw_locator`
- `hash`

#### `session_turns`

- `id`
- `session_id`
- `seq`
- `role`
- `language_hint`
- `text`
- `source_span_ref`
- `is_tool_noise`

#### `generation_jobs`

- `id`
- `created_at`
- `status`
- `selected_filters_json`
- `selected_session_count`
- `progress_json`

`status` values:

- `pending`
- `normalizing`
- `mining`
- `enriching`
- `ranking`
- `materializing`
- `completed`
- `failed`
- `cancelled`

#### `generation_job_sessions`

- `job_id`
- `session_id`
- `snapshot_title`
- `snapshot_hash`

This freezes the selected input set for reproducibility.

#### `workbooks`

- `id`
- `job_id`
- `created_at`
- `status`

`status` values:

- `draft`
- `ready`
- `failed`
- `cancelled`

#### `workbook_items`

- `id`
- `workbook_id`
- `item_type`
- `generated_snapshot_json`
- `current_snapshot_json`
- `state`

`state` values:

- `active`
- `deleted`

Edited status is derived, not persisted as a lifecycle state. It should be computed from:

- `generated_snapshot_json != current_snapshot_json`
- or equivalent edit-revision metadata

#### `workbook_item_revisions`

- `id`
- `workbook_item_id`
- `action_type`
- `before_json`
- `after_json`
- `created_at`

This supports restore/revert behavior without requiring a global undo engine.

#### `export_runs`

- `id`
- `workbook_id`
- `export_type`
- `output_path`
- `created_at`
- `metadata_json`

## Workbook Item Model

v1 supports two primary learning-item types only.

### `Expression`

For:

- word
- phrase
- domain-specific term

### `Sentence`

For:

- full example sentence
- bilingual sentence
- focus-expression sentence
- sentence-based quiz item

Grammar is not a third independent item type in v1. If needed, represent grammar through `Sentence` explanation fields and tags.

### Canonical item shape

Every workbook item should normalize to:

- `id`
- `item_type`
- `source_language`
- `target_language`
- `source_text`
- `target_text`
- `gloss`
- `context_text`
- `explanation`
- `quiz_prompt`
- `quiz_answer`
- `tags`
- `source_refs`

## Generation Pipeline

The generation pipeline must not operate at the naive whole-session-to-LLM granularity.

Every generation stage runs as a background job, not in the renderer and not as one giant synchronous main-process task.

### Flow

1. `scan`
   - discover sessions and projects
   - update local index
   - execute as a background job
2. `select`
   - user filters and selects sessions
   - create `generation_job`
3. `normalize`
   - read selected sessions
   - normalize into conversation turns
   - execute as a background job
4. `pre-clean`
   - remove tool noise
   - trim oversized code/log blobs
   - preserve useful mixed-language natural-language turns
   - see [generation pre-clean and candidate mining](../../architecture/2026-06-18-generation-preclean-candidate-mining.md)
   - execute as a background job
5. `candidate mining`
   - local heuristics first
   - current implementation uses pre-cleaned natural-language excerpts instead of sending every non-empty turn to the model
   - current implementation removes pure URL/path/hash/shell fragments, obvious code/log/tool output, short trivial text, and conservative local near-duplicates before applying the per-session candidate cap
   - see [generation pre-clean and candidate mining](../../architecture/2026-06-18-generation-preclean-candidate-mining.md)
   - execute as a background job
6. `LLM enrichment`
   - small bounded batches only
   - include the saved expression difficulty setting (`easy`, `average`, `hard`) in the extraction prompt
   - prompt should reject trivial expression cards such as `hi` and `excuse me`
   - execute as a background job
7. `global dedup + ranking`
   - merge exact duplicates and conservative near-duplicates across sessions
   - current implementation performs exact normalized dedup by `item_type + sourceText`
   - current implementation also merges obvious source-text near-duplicates such as article/punctuation/contraction variants, while avoiding broad semantic clustering that could hide distinct learning items
   - current implementation drops obvious trivial `Expression` items before workbook materialization
   - current implementation applies in-memory heuristic base ranking and type-balance rerank before workbook materialization
   - execute as a background job
8. `workbook materialization`
   - create workbook items
   - execute as a background job
9. `review`
   - edit/delete/restore/revert
10. `export`
   - all current-state active items from a `ready` workbook are exportable by default
   - execute as a background job

### Job state machine

Recommended generation-job state flow:

```text
pending
  -> normalizing
  -> mining
  -> enriching
  -> ranking
  -> materializing
  -> completed

any non-completed state -> failed
any non-completed state -> cancelled
```

### Checkpoints

Checkpoint at practical stage boundaries:

- normalized turns persisted per session
- mined candidate groups persisted per job
- enrichment results persisted per batch
- ranked candidate ordering persisted per job
- workbook item writes persisted incrementally during materialization

This allows retry or resume from the last completed checkpoint instead of restarting the full pipeline every time.

### Cancel and partial results

- if a job is cancelled before materialization starts:
  - mark the job `cancelled`
  - preserve intermediate job artifacts
  - do not promote a workbook
- if a job is cancelled during or after materialization starts:
  - mark the job `cancelled`
  - preserve a `workbooks.status = draft` workbook
  - do not treat that draft as export-ready by default

`failed` and `cancelled` jobs should be resumable from the last durable checkpoint where practical; otherwise they should be restartable from scratch with preserved diagnostics.

### Candidate mining

Use local heuristics before the model. The current implementation is documented in [generation pre-clean and candidate mining](../../architecture/2026-06-18-generation-preclean-candidate-mining.md).

At a high level:

- `precleanTurns` removes pure-noise turns and strips code/log/path/shell lines from mixed natural-language turns.
- `mineCandidateGroups` segments surviving text, filters trivial or fragment-only excerpts, deduplicates conservative near-matches, ranks candidates, then applies `maxItemsPerSession`.
- The model enriches candidate groups; it should not rediscover everything from raw transcripts.

```mermaid
flowchart TD
  A[原始 turn] --> B[precleanTurns]
  B --> C{isTurnToolNoise?}
  C -->|是| D[丢弃整 turn]
  C -->|否| E[cleanNaturalLanguageText]
  E --> F{清洗后仍噪声/空?}
  F -->|是| D
  F -->|否| G[mineCandidateGroups]
  G --> H[再 clean + 分段]
  H --> I[长度/片段/噪声过滤]
  I --> J[指纹去重]
  J --> K[启发式打分排序]
  K --> L[maxItemsPerSession cap]
  L --> M[LLM enrichment]
```

Historical note: older plan prose mentioned language detection, phrase extraction, and frequency detection. v1 instead uses the conservative regex/heuristic pipeline above.

## Ranking Strategy

Ranking should not be a pure black-box model decision.

Ranking should remain interpretable in v1. Use a two-stage approach:

1. `base ranking`
   - score each candidate independently
   - compute scores separately for `Expression` and `Sentence`
2. `diversity rerank`
   - optimize the default presented ordering for type balance only
   - prevent one item type from dominating the top of the workbook

### 1. Hard filter

Remove obvious bad candidates:

- too short or too long
- pure path / URL / hash / shell fragment
- large code/log noise
- generic boilerplate
- near-duplicate junk

Sensitive content should not be handled mainly as a ranking penalty.

- obvious sensitive or unsafe content should be removed in `hard filter`
- borderline sensitive content should be flagged for manual review
- export may block flagged items unless the user explicitly keeps them

### 2. Heuristic scoring

All positive scores and penalties must be normalized to `[0,1]` before combination.

Do not rely on unstable per-job min-max scaling as the main normalization mechanism. Prefer bounded transforms and fixed semantic output ranges where practical.

`recurrence_score` should use log compression instead of raw linear counts:

```text
recurrence_score =
  log(1 + occurrence_count) / log(1 + max_occurrence_count)
```

This prevents highly frequent items from dominating too aggressively.

Compute local interpretable scores:

- `recurrence_score`
- `context_score`
- `domain_score`
- `language_gap_score`
- `source_quality_score`
- `noise_penalty`
- `dup_penalty`

`source_quality_score` should reflect source cleanliness and confidence, for example:

- provenance completeness
- non-fragmented context
- non-truncated usable turns
- generally clean transcript extraction context

### 3. LLM enrichment signals

Ask the model for bounded structured hints:

- `item_type`
- `usefulness_score`
- `difficulty_band`
- `concise_rationale`
- `preferred_context`

### Base ranking: Expression

`Expression` items should emphasize recurrence and domain relevance.

```text
base_score_expression =
  0.25 * recurrence_score +
  0.25 * domain_score +
  0.20 * context_score +
  0.15 * language_gap_score +
  0.10 * usefulness_score +
  0.05 * source_quality_score
  - 0.15 * noise_penalty
  - 0.10 * dup_penalty
```

### Base ranking: Sentence

`Sentence` items should emphasize context richness and bilingual learning value.

```text
base_score_sentence =
  0.10 * recurrence_score +
  0.15 * domain_score +
  0.30 * context_score +
  0.25 * language_gap_score +
  0.15 * usefulness_score +
  0.05 * source_quality_score
  - 0.15 * noise_penalty
  - 0.10 * dup_penalty
```

### Base score handling

Preserve a high-resolution internal base score for ordering, and clamp only for display if needed.

- `raw_base_score`
- `display_score = clamp(raw_base_score, 0, 1)`

### Diversity rerank

v1 does not need full MMR, session caps, project caps, or hard quotas.

The rerank stage should only support a soft target balance between item types, for example:

- `Expression = 60%`
- `Sentence = 40%`

This balance is not a hard constraint. It is a recommendation-order preference only.

Implementation recommendation:

- rank `Expression` items by `base_score_expression`
- rank `Sentence` items by `base_score_sentence`
- greedily merge the two ordered queues
- at each step, apply a small bonus to the type that is currently below its target ratio
- keep original base scores unchanged

This improves the workbook as an ordered set while preserving the full candidate set.

Store rerank outputs separately from base scores, for example:

- `raw_base_score`
- `recommended_rank_profile`
- `recommended_order_index`

Suggested default rerank profile:

```json
{
  "mode": "type_balance",
  "target_expression": 0.6,
  "target_sentence": 0.4,
  "lambda": 0.1
}
```

The user may later adjust the type-balance target without rerunning the full generation pipeline.

### Final ranking note

In v1, the workbook should retain the full candidate set. Ranking primarily affects default ordering and recommendation emphasis, not hard candidate elimination after generation.

## Provider and Model Strategy

v1 model entry is intentionally narrow.

### Supported entries

- OpenAI-compatible API endpoint
- Codex CLI
- Claude CLI
- OpenCode CLI

Do not support a wide matrix of provider-specific API types in v1.

### Why this narrow model surface

- reduces provider-configuration surface
- keeps LiteLLM available as an OpenAI-compatible local gateway
- keeps DialogLingo from becoming a provider router
- supports subscription-plan CLI use through a small set of explicit local backends

### ModelAdapter

DialogLingo owns a thin `ModelAdapter` abstraction, but not a full provider platform.

It should accept:

- `base_url`
- `api_key`
- `model_name`
- generation settings needed for structured extraction

## Structured Output

Use structured output strongly, but only at LLM boundaries.

### Good uses

- `LearningItemDraft`
- `BatchExtractionResult`
- `WorkbookItemPatch`
- `ExportPreviewRow`

### Bad uses

- transcript parsing
- scan/index transport
- progress events
- revision logs

Keep schemas small. Prefer one item or a small array of items over giant all-in-one workbook schemas.

## Workbook Editing Model

The user requested a simpler alternative to a global undo system. Use this model:

- single delete:
  - no confirmation
  - move item to `Recently deleted`
- restore:
  - `Restore last deleted`
  - restore from `Recently deleted`
- batch delete:
  - lightweight confirmation
- editing:
  - `Save`
  - `Cancel`
  - `Revert`
- autosave:
  - autosave confirmed workbook draft state
  - do not silently commit unsaved edit-buffer changes

`Edited` is a workbook view filter, not a persisted lifecycle state.

### Edit semantics

- `Cancel`: discard current unsaved edit buffer
- `Revert`: reset the item to its original generated snapshot

### Export semantics

- export all `state = active` items from a `workbooks.status = ready` workbook by default
- this includes both untouched generated items and edited items
- never export `state = deleted` items unless they are restored first

This avoids the complexity of a universal Ctrl+Z stack while preserving user trust.

## Progress Model

Progress must be job-stage based, not token-stream theater.

Emit typed events such as:

- `job.started`
- `session.normalized`
- `batch.started`
- `batch.completed`
- `items.materialized`
- `job.completed`
- `job.failed`

The renderer should subscribe to job events and feed those events into `TanStack Query` cache updates for:

- current job snapshot
- per-job counters
- workbook availability
- error summaries

The query cache remains the source of truth for async view state; the event stream is the incremental transport.

The UI should show:

- total session count
- processed session count
- current phase
- current batch/session
- items created
- warning/failure counts

## Export Strategy

Anki is the primary target, but export must always degrade cleanly.

### Primary targets

1. `Anki Package`
2. `Anki Text Bundle`
3. `Generic Text Bundle`

### Anki note types

#### `DialogLingo::Expression`

- `Front`
- `Back`
- `Gloss`
- `Context`
- `Explanation`
- `Quiz`
- `Tags`

#### `DialogLingo::Sentence`

- `Front`
- `Back`
- `Focus`
- `Explanation`
- `Quiz`
- `Tags`

### Export modal fields

- `Format`
- `Deck name`
- `Direction`
  - `EN -> ZH`
  - `ZH -> EN`
  - `Bilingual`
- `Include item types`
  - `Expression`
  - `Sentence`
- `Tag prefix`
- `Output location`
- `New folder name`
  - visible for text-bundle exports
  - names the subfolder created inside `Output location`

Do not add persistent template-management complexity in v1. The generation confirmation sheet may expose only the current run's final prompt draft.

Prompt drafts should keep model-facing context compact: Markdown sections for role, task, rules, output contract, and input conversation; `<session title="...">` boundaries inside the input section; and plain `user:` / `assistant:` turns. Do not expose internal `source_span_ref`, session ids, or candidate numbering in the model prompt; keep source mapping in application state. Because the runtime supplies a JSON Schema separately, prompts should mention schema adherence and the empty object form `{"items":[]}` without embedding the full schema text.

### Bundle contents

Text bundle exports create a new subfolder inside the chosen output location before writing bundle files. If the requested folder name already exists, DialogLingo should create a unique sibling such as `DialogLingo-2` instead of mixing files into an existing folder.

#### `Anki Text Bundle`

- `expression.tsv`
- `sentence.tsv`
- `README-import.md`
- `manifest.json`

#### `Generic Text Bundle`

- `expression.csv`
- `sentence.csv`
- `expression.md`
- `sentence.md`
- `manifest.json`

### Manifest

Every bundle should include `manifest.json` with:

- export time
- workbook id
- selected item count
- format
- language direction
- included item types
- tags
- source platform summary

## Privacy and Safety

Transcript privacy is a first-order requirement.

### Requirements

- local index by default
- explicit provider configuration before remote generation
- visible provenance from workbook item back to source session span
- transcript pre-cleaning before provider calls
- redaction and filtering policy for obvious sensitive noise
- deleted items must not silently reappear in export
- flagged items may require explicit keep/confirm before export
- export defaults should be visible to the user, including that active generated items are exportable by default

### Risk note

Coding-agent transcripts can contain:

- file paths
- repo names
- copied logs
- secret-like strings
- code and stack traces

The app must treat remote generation as deliberate, not invisible background syncing.

## Error Handling

### Source layer

- missing path
- unreadable local source
- malformed session payload
- hash mismatch between indexed and current content

Handle by:

- recording warning state
- preserving unaffected sessions
- showing source-level issue summaries

### Job layer

- partial batch failure
- provider timeout
- invalid structured payload
- LiteLLM request failure

Handle by:

- bounded retries
- partial-result persistence
- failed-batch counters
- resumable or restartable generation job state

### Export layer

- invalid output location
- failed package build
- unsupported field data

Handle by:

- fail export cleanly
- preserve workbook
- allow fallback to text-bundle export

## Testing Strategy

### Must-have tests

- `Vitest` as the default test runner
- per-source adapter fixture tests
- normalization tests across mixed-language turns
- denoising tests for code/log/path-heavy content
- candidate dedup tests
- ranking tests with deterministic fixtures
- workbook edit/delete/restore/revert tests
- export mapping tests

These should be fixture-driven wherever practical so adapter shape, ranking behavior, and export structure are pinned early.

### Manual verification

- launch app on macOS/Windows/Linux
- auto-discover projects and sessions
- select sessions by default-open state
- generate workbook through the configured model backend
- edit/delete/restore items
- export Anki text bundle
- verify import into Anki

## v1 Scope Cut

To keep v1 sane:

- keep `Codex`, `Claude Code`, and `OpenCode` in the design
- but allow implementation staging if one adapter proves materially harder
- keep API model access to an OpenAI-compatible endpoint, with supported local CLI backends as explicit alternatives
- keep workbook item types to `Expression` and `Sentence`
- keep export targets to `Anki-first + text bundles`

The main value is not breadth. It is quality of the reviewed workbook loop.

## Acceptance Summary

DialogLingo v1 is successful if a user can:

1. open the app
2. see auto-discovered projects and sessions
3. filter and select sessions
4. generate a workbook from mixed-language AI conversations
5. review, edit, delete, restore, and revert workbook items
6. export to Anki-first formats
7. trust that the app preserved provenance and did not force them into an opaque black-box pipeline
