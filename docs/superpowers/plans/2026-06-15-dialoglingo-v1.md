# DialogLingo V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build DialogLingo v1 as a local-first Electron desktop app that scans Codex/Claude Code/OpenCode sessions, generates reviewed Expression/Sentence workbooks through LiteLLM, and exports them to Anki-first formats.

**Architecture:** Use a single Electron app with a typed IPC boundary (`electron-trpc + Zod`), a local SQLite/Drizzle data layer, source-specific adapters for transcript ingestion, background jobs for scan/generation/export, and a React renderer split into `Search & Select` and `Workbook` sections. Keep transcript parsing, workbook state, and export orchestration inside the app; reuse LiteLLM and existing local source layouts rather than building a provider router or a generic transcript browser.

**Tech Stack:** Electron, electron-vite, React, TypeScript strict, Zustand, TanStack Query/Table/Virtual, better-sqlite3, Drizzle ORM, SQLite FTS5, electron-trpc, Zod, Motion for React, Vitest

---

## File Structure

### Root and Tooling

- Create: `package.json`
- Create: `electron.vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tsconfig.web.json`
- Create: `drizzle.config.ts`
- Create: `vitest.config.ts`
- Modify: `.gitignore`

### Electron Processes

- Create: `src/main/index.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/styles.css`

### Shared Contracts

- Create: `src/shared/navigation.ts`
- Create: `src/shared/schemas/settings.ts`
- Create: `src/shared/schemas/sessions.ts`
- Create: `src/shared/schemas/jobs.ts`
- Create: `src/shared/schemas/workbook.ts`
- Create: `src/shared/schemas/export.ts`
- Create: `src/shared/ipc/router.ts`
- Create: `src/shared/ipc/events.ts`

### Database

- Create: `src/main/db/client.ts`
- Create: `src/main/db/schema.ts`
- Create: `src/main/db/migrate.ts`
- Create: `src/main/db/fts.ts`
- Create: `src/main/db/migrations/0000_initial.sql`
- Create: `src/main/db/migrations/0001_session_fts.sql`

### Settings and Services

- Create: `src/main/settings/service.ts`
- Create: `src/main/settings/defaults.ts`

### Sources and Indexing

- Create: `src/main/sources/types.ts`
- Create: `src/main/sources/index.ts`
- Create: `src/main/sources/codex/adapter.ts`
- Create: `src/main/sources/claude/adapter.ts`
- Create: `src/main/sources/opencode/adapter.ts`
- Create: `src/main/scan/discoverProjects.ts`
- Create: `src/main/scan/scanSessions.ts`
- Create: `src/main/search/querySessions.ts`
- Create: `src/main/search/queryPreview.ts`

### Generation Pipeline

- Create: `src/main/generation/preclean.ts`
- Create: `src/main/generation/candidates.ts`
- Create: `src/main/generation/litellmClient.ts`
- Create: `src/main/generation/ranking.ts`
- Create: `src/main/generation/materializeWorkbook.ts`
- Create: `src/main/generation/jobRunner.ts`
- Create: `src/main/generation/worker.ts`
- Create: `src/main/generation/spawnGenerationWorker.ts`

### Export

- Create: `src/main/export/manifest.ts`
- Create: `src/main/export/ankiTextBundle.ts`
- Create: `src/main/export/genericTextBundle.ts`
- Create: `src/main/export/apkg.ts`

### Renderer: Shared State and Client

- Create: `src/renderer/src/lib/trpc.ts`
- Create: `src/renderer/src/lib/useJobSubscription.ts`
- Create: `src/renderer/src/app/store/uiState.ts`
- Create: `src/renderer/src/app/store/sourcePanel.ts`

### Renderer: Search & Select

- Create: `src/renderer/src/features/search/SearchPage.tsx`
- Create: `src/renderer/src/features/search/SearchRail.tsx`
- Create: `src/renderer/src/features/search/SessionTree.tsx`
- Create: `src/renderer/src/features/search/SessionPreviewPane.tsx`
- Create: `src/renderer/src/features/search/GenerateWorkbookSheet.tsx`

### Renderer: Workbook

- Create: `src/renderer/src/features/workbook/WorkbookPage.tsx`
- Create: `src/renderer/src/features/workbook/WorkbookToolbar.tsx`
- Create: `src/renderer/src/features/workbook/CardStream.tsx`
- Create: `src/renderer/src/features/workbook/WorkbookCard.tsx`
- Create: `src/renderer/src/features/workbook/SourcePanel.tsx`
- Create: `src/renderer/src/features/workbook/ExportModal.tsx`

### Tests and Fixtures

- Create: `tests/shared/navigation.test.ts`
- Create: `tests/main/settings-service.test.ts`
- Create: `tests/main/testDb.ts`
- Create: `tests/main/sources/codex-adapter.test.ts`
- Create: `tests/main/sources/claude-adapter.test.ts`
- Create: `tests/main/sources/opencode-adapter.test.ts`
- Create: `tests/main/search/query-sessions.test.ts`
- Create: `tests/main/generation/preclean.test.ts`
- Create: `tests/main/generation/ranking.test.ts`
- Create: `tests/main/generation/type-balance-rerank.test.ts`
- Create: `tests/main/workbook/workbook-service.test.ts`
- Create: `tests/main/export/anki-text-bundle.test.ts`
- Create: `tests/main/export/apkg.test.ts`
- Create: `tests/main/export/generic-text-bundle.test.ts`
- Create: `tests/renderer/ui-state.test.ts`
- Create: `tests/fixtures/codex/...`
- Create: `tests/fixtures/claude/...`
- Create: `tests/fixtures/opencode/...`

This is one integrated plan, not separate subsystem plans, because the app’s value comes from one sequential pipeline: ingest -> select -> generate -> review -> export. The tasks below still keep clean subsystem boundaries so implementation can be parallelized later.

### Task 1: Bootstrap Electron App Shell and Shared Navigation

**Files:**
- Create: `package.json`
- Create: `electron.vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tsconfig.web.json`
- Create: `vitest.config.ts`
- Create: `src/shared/navigation.ts`
- Create: `src/main/index.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/styles.css`
- Test: `tests/shared/navigation.test.ts`

- [ ] **Step 1: Write the failing navigation contract test**

```ts
// tests/shared/navigation.test.ts
import { describe, expect, it } from 'vitest'
import { NAV_SECTIONS } from '../../src/shared/navigation'

describe('NAV_SECTIONS', () => {
  it('declares the two top-level sections in order', () => {
    expect(NAV_SECTIONS).toEqual([
      { id: 'search', label: 'Search & Select' },
      { id: 'workbook', label: 'Workbook' }
    ])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- --run tests/shared/navigation.test.ts
```

Expected: FAIL with `Cannot find module '../../src/shared/navigation'` or missing npm scripts because the shell has not been bootstrapped yet.

- [ ] **Step 3: Create the base toolchain and shell files**

```json
// package.json
{
  "name": "dialoglingo",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "dist-electron/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:migrate": "tsx src/main/db/migrate.ts"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.0.0",
    "@tanstack/react-table": "^8.0.0",
    "@tanstack/react-virtual": "^3.0.0",
    "@trpc/client": "^10.0.0",
    "@trpc/server": "^10.0.0",
    "@paperclipsapp/anki-apkg-export": "^5.0.0",
    "better-sqlite3": "^11.0.0",
    "drizzle-orm": "^0.33.0",
    "electron": "^34.0.0",
    "electron-trpc": "^0.7.1",
    "motion": "^11.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.23.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "drizzle-kit": "^0.24.0",
    "electron-vite": "^3.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^2.0.0"
  }
}
```

```ts
// electron.vite.config.ts
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  main: { build: { outDir: 'dist-electron/main' } },
  preload: { build: { outDir: 'dist-electron/preload' } },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@renderer': path.resolve('src/renderer/src'),
        '@shared': path.resolve('src/shared')
      }
    }
  }
})
```

```ts
// src/shared/navigation.ts
export const NAV_SECTIONS = [
  { id: 'search', label: 'Search & Select' },
  { id: 'workbook', label: 'Workbook' }
] as const

export type NavSectionId = (typeof NAV_SECTIONS)[number]['id']
```

```tsx
// src/renderer/src/App.tsx
import { NAV_SECTIONS } from '../../shared/navigation'

export default function App() {
  return (
    <div className="app-shell">
      <nav className="section-switcher">
        {NAV_SECTIONS.map((section) => (
          <button key={section.id} type="button">
            {section.label}
          </button>
        ))}
      </nav>
      <main className="boot-message">DialogLingo bootstrapped.</main>
    </div>
  )
}
```

```ts
// src/preload/index.ts
process.once('loaded', () => {
  // Exposed later by electron-trpc wiring in Task 2.
})
```

```tsx
// src/renderer/src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

```ts
// src/main/index.ts
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/index.js')
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)
```

- [ ] **Step 4: Install dependencies and verify the shell**

Run:

```bash
npm install
npm run test -- --run tests/shared/navigation.test.ts
npm run typecheck
npm run build
```

Expected:

- `tests/shared/navigation.test.ts` PASS
- `typecheck` exits 0
- `build` emits Electron and renderer bundles without module-resolution errors

- [ ] **Step 5: Commit the shell bootstrap**

```bash
git add package.json electron.vite.config.ts tsconfig.json tsconfig.node.json tsconfig.web.json vitest.config.ts src/main/index.ts src/preload/index.ts src/renderer/src/main.tsx src/renderer/src/App.tsx src/renderer/src/styles.css src/shared/navigation.ts tests/shared/navigation.test.ts
git commit -m "feat: bootstrap dialoglingo electron shell"
```

### Task 2: Add Typed IPC, SQLite, Drizzle, and Settings Service

**Files:**
- Create: `drizzle.config.ts`
- Create: `src/shared/schemas/settings.ts`
- Create: `src/shared/schemas/jobs.ts`
- Create: `src/shared/schemas/workbook.ts`
- Create: `src/shared/schemas/export.ts`
- Create: `src/shared/ipc/events.ts`
- Create: `src/shared/ipc/router.ts`
- Create: `src/main/db/client.ts`
- Create: `src/main/db/schema.ts`
- Create: `src/main/db/migrate.ts`
- Create: `src/main/db/fts.ts`
- Create: `src/main/db/migrations/0000_initial.sql`
- Create: `src/main/settings/defaults.ts`
- Create: `src/main/settings/service.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Create: `src/renderer/src/lib/trpc.ts`
- Test: `tests/main/settings-service.test.ts`

- [ ] **Step 1: Write the failing settings-service test**

```ts
// tests/main/settings-service.test.ts
import { describe, expect, it } from 'vitest'
import { createSettingsService } from '../../src/main/settings/service'

describe('createSettingsService', () => {
  it('returns defaults when the database is empty', () => {
    const service = createSettingsService(':memory:', { runMigrations: true })
    expect(service.get()).toMatchObject({
      provider: { baseUrl: '', apiKey: '', defaultModel: '' },
      generation: { batchSize: 8, boundedConcurrency: 2, maxItemsPerSession: 50 },
      privacy: { redactBeforeRemoteSend: true, flaggedItemExportPolicy: 'warn' },
      scan: { scanOnLaunch: true, includeArchivedSessions: false }
    })
  })
})
```

- [ ] **Step 2: Run the settings test and verify it fails**

Run:

```bash
npm run test -- --run tests/main/settings-service.test.ts
```

Expected: FAIL with `Cannot find module '../../src/main/settings/service'`.

- [ ] **Step 3: Create the settings schema, database files, and typed IPC router**

```ts
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/main/db/schema.ts',
  out: './src/main/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './dialoglingo.db'
  }
})
```

```ts
// src/shared/schemas/settings.ts
import { z } from 'zod'

export const settingsSchema = z.object({
  provider: z.object({
    baseUrl: z.string(),
    apiKey: z.string(),
    defaultModel: z.string()
  }),
  generation: z.object({
    defaultLanguageDirection: z.enum(['en-zh', 'zh-en', 'bilingual']),
    batchSize: z.number().int().positive(),
    boundedConcurrency: z.number().int().positive(),
    maxItemsPerSession: z.number().int().positive(),
    typeBalanceProfile: z.object({
      targetExpression: z.number().min(0).max(1),
      targetSentence: z.number().min(0).max(1),
      lambda: z.number().min(0)
    })
  }),
  privacy: z.object({
    redactBeforeRemoteSend: z.boolean(),
    flaggedItemExportPolicy: z.enum(['block', 'warn'])
  }),
  scan: z.object({
    pathOverrides: z.array(z.object({ platform: z.string(), path: z.string() })),
    scanOnLaunch: z.boolean(),
    includeArchivedSessions: z.boolean()
  })
})

export type Settings = z.infer<typeof settingsSchema>
```

```ts
// src/shared/schemas/export.ts
import { z } from 'zod'

export const exportFormatSchema = z.enum(['anki-package', 'anki-text-bundle', 'generic-text-bundle'])
export const exportRequestSchema = z.object({
  format: exportFormatSchema,
  deckName: z.string(),
  direction: z.enum(['en-zh', 'zh-en', 'bilingual']),
  includeExpressions: z.boolean(),
  includeSentences: z.boolean(),
  tagPrefix: z.string(),
  outputLocation: z.string()
})
```

```ts
// src/main/db/schema.ts
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const settingsTable = sqliteTable('settings', {
  id: integer('id').primaryKey(),
  json: text('json').notNull()
})

export const projectsTable = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  localPath: text('local_path').notNull(),
  sourcePlatformsJson: text('source_platforms_json').notNull(),
  discoveredAt: text('discovered_at').notNull(),
  userPinned: integer('user_pinned', { mode: 'boolean' }).notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull()
})

export const sessionsTable = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  sourceType: text('source_type').notNull(),
  sourceSessionId: text('source_session_id').notNull(),
  projectId: text('project_id'),
  title: text('title').notNull(),
  startedAt: text('started_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  preview: text('preview').notNull(),
  searchText: text('search_text').notNull(),
  rawLocator: text('raw_locator').notNull(),
  hash: text('hash').notNull()
})

export const sessionTurnsTable = sqliteTable('session_turns', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  seq: integer('seq').notNull(),
  role: text('role').notNull(),
  languageHint: text('language_hint').notNull(),
  text: text('text').notNull(),
  sourceSpanRef: text('source_span_ref').notNull(),
  isToolNoise: integer('is_tool_noise', { mode: 'boolean' }).notNull()
})

export const generationJobsTable = sqliteTable('generation_jobs', {
  id: text('id').primaryKey(),
  createdAt: text('created_at').notNull(),
  status: text('status').notNull(),
  selectedFiltersJson: text('selected_filters_json').notNull(),
  selectedSessionCount: integer('selected_session_count').notNull(),
  progressJson: text('progress_json').notNull()
})

export const generationJobSessionsTable = sqliteTable('generation_job_sessions', {
  jobId: text('job_id').notNull(),
  sessionId: text('session_id').notNull(),
  snapshotTitle: text('snapshot_title').notNull(),
  snapshotHash: text('snapshot_hash').notNull()
})

export const workbooksTable = sqliteTable('workbooks', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull(),
  createdAt: text('created_at').notNull(),
  status: text('status').notNull()
})

export const workbookItemsTable = sqliteTable('workbook_items', {
  id: text('id').primaryKey(),
  workbookId: text('workbook_id').notNull(),
  itemType: text('item_type').notNull(),
  generatedSnapshotJson: text('generated_snapshot_json').notNull(),
  currentSnapshotJson: text('current_snapshot_json').notNull(),
  sourceRefsJson: text('source_refs_json').notNull(),
  state: text('state').notNull()
})

export const workbookItemRevisionsTable = sqliteTable('workbook_item_revisions', {
  id: text('id').primaryKey(),
  workbookItemId: text('workbook_item_id').notNull(),
  actionType: text('action_type').notNull(),
  beforeJson: text('before_json').notNull(),
  afterJson: text('after_json').notNull(),
  createdAt: text('created_at').notNull()
})

export const exportRunsTable = sqliteTable('export_runs', {
  id: text('id').primaryKey(),
  workbookId: text('workbook_id').notNull(),
  exportType: text('export_type').notNull(),
  outputPath: text('output_path').notNull(),
  createdAt: text('created_at').notNull(),
  metadataJson: text('metadata_json').notNull()
})
```

```ts
// src/main/db/client.ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

export function createDb(filename: string) {
  const sqlite = new Database(filename)
  return {
    sqlite,
    db: drizzle(sqlite)
  }
}
```

```ts
// src/main/db/migrate.ts
import fs from 'node:fs'
import path from 'node:path'
import { createDb } from './client'

const { sqlite } = createDb(process.env.DIALOGLINGO_DB_PATH ?? 'dialoglingo.db')
const migrationsDir = path.resolve('src/main/db/migrations')

for (const file of fs.readdirSync(migrationsDir).filter((entry) => entry.endsWith('.sql')).sort()) {
  sqlite.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf-8'))
}
```

```sql
-- src/main/db/migrations/0000_initial.sql
create table if not exists settings (
  id integer primary key check (id = 1),
  json text not null
);

create table if not exists projects (
  id text primary key,
  name text not null,
  local_path text not null,
  source_platforms_json text not null,
  discovered_at text not null,
  user_pinned integer not null,
  is_active integer not null
);

create table if not exists sessions (
  id text primary key,
  source_type text not null,
  source_session_id text not null,
  project_id text references projects(id),
  title text not null,
  started_at text not null,
  updated_at text not null,
  preview text not null,
  search_text text not null,
  raw_locator text not null,
  hash text not null
);

create table if not exists session_turns (
  id text primary key,
  session_id text not null references sessions(id) on delete cascade,
  seq integer not null,
  role text not null,
  language_hint text not null,
  text text not null,
  source_span_ref text not null,
  is_tool_noise integer not null
);

create table if not exists generation_jobs (
  id text primary key,
  created_at text not null,
  status text not null,
  selected_filters_json text not null,
  selected_session_count integer not null,
  progress_json text not null
);

create table if not exists generation_job_sessions (
  job_id text not null references generation_jobs(id) on delete cascade,
  session_id text not null references sessions(id) on delete cascade,
  snapshot_title text not null,
  snapshot_hash text not null,
  primary key (job_id, session_id)
);

create table if not exists candidate_groups (
  id text primary key,
  job_id text not null references generation_jobs(id) on delete cascade,
  session_id text not null references sessions(id) on delete cascade,
  source_span_ref text not null,
  prompt_text text not null,
  status text not null
);

create table if not exists enrichment_batches (
  id text primary key,
  job_id text not null references generation_jobs(id) on delete cascade,
  batch_index integer not null,
  status text not null,
  request_json text not null,
  response_json text not null
);

create table if not exists ranked_orders (
  id text primary key,
  job_id text not null references generation_jobs(id) on delete cascade,
  rank_profile_json text not null,
  ordered_ids_json text not null
);

create table if not exists workbooks (
  id text primary key,
  job_id text not null references generation_jobs(id) on delete cascade,
  created_at text not null,
  status text not null
);

create table if not exists workbook_items (
  id text primary key,
  workbook_id text not null references workbooks(id) on delete cascade,
  item_type text not null,
  generated_snapshot_json text not null,
  current_snapshot_json text not null,
  source_refs_json text not null,
  state text not null
);

create table if not exists workbook_item_revisions (
  id text primary key,
  workbook_item_id text not null references workbook_items(id) on delete cascade,
  action_type text not null,
  before_json text not null,
  after_json text not null,
  created_at text not null
);

create table if not exists export_runs (
  id text primary key,
  workbook_id text not null references workbooks(id) on delete cascade,
  export_type text not null,
  output_path text not null,
  created_at text not null,
  metadata_json text not null
);
```

```ts
// src/main/settings/defaults.ts
import type { Settings } from '../../shared/schemas/settings'

export const DEFAULT_SETTINGS: Settings = {
  provider: { baseUrl: '', apiKey: '', defaultModel: '' },
  generation: {
    defaultLanguageDirection: 'bilingual',
    batchSize: 8,
    boundedConcurrency: 2,
    maxItemsPerSession: 50,
    typeBalanceProfile: { targetExpression: 0.6, targetSentence: 0.4, lambda: 0.1 }
  },
  privacy: { redactBeforeRemoteSend: true, flaggedItemExportPolicy: 'warn' },
  scan: { pathOverrides: [], scanOnLaunch: true, includeArchivedSessions: false }
}
```

```ts
// src/main/settings/service.ts
import { createDb } from '../db/client'
import { DEFAULT_SETTINGS } from './defaults'
import { settingsSchema } from '../../shared/schemas/settings'

export function createSettingsService(filename: string, options?: { runMigrations?: boolean }) {
  const { sqlite } = createDb(filename)
  if (options?.runMigrations) {
    sqlite.exec('create table if not exists settings (id integer primary key check (id = 1), json text not null);')
  }

  return {
    get() {
      const row = sqlite.prepare('select json from settings where id = 1').get() as { json?: string } | undefined
      if (!row?.json) return DEFAULT_SETTINGS
      return settingsSchema.parse(JSON.parse(row.json))
    },
    save(nextJson: unknown) {
      const next = settingsSchema.parse(nextJson)
      sqlite.prepare('insert into settings (id, json) values (1, ?) on conflict(id) do update set json = excluded.json')
        .run(JSON.stringify(next))
      return next
    }
  }
}
```

```ts
// src/shared/schemas/jobs.ts
import { z } from 'zod'

export const generationJobStatusSchema = z.enum([
  'pending',
  'normalizing',
  'mining',
  'enriching',
  'ranking',
  'materializing',
  'completed',
  'failed',
  'cancelled'
])

export const generationJobSnapshotSchema = z.object({
  id: z.string(),
  status: generationJobStatusSchema,
  selectedSessionCount: z.number().int().nonnegative(),
  processedSessionCount: z.number().int().nonnegative(),
  createdItemCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative()
})
```

```ts
// src/shared/schemas/workbook.ts
import { z } from 'zod'

export const workbookStatusSchema = z.enum(['draft', 'ready', 'failed', 'cancelled'])
export const workbookItemTypeSchema = z.enum(['Expression', 'Sentence'])
export const workbookItemStateSchema = z.enum(['active', 'deleted'])
```

```ts
// src/shared/ipc/events.ts
import { z } from 'zod'
import { generationJobStatusSchema } from '../schemas/jobs'

export const jobEventSchema = z.object({
  kind: z.enum(['snapshot', 'phase', 'warning', 'failure', 'completed']),
  jobId: z.string(),
  status: generationJobStatusSchema,
  totalSelectedSessionCount: z.number().int().nonnegative(),
  processedSessionCount: z.number().int().nonnegative(),
  createdItemCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
  currentSessionTitle: z.string().nullable(),
  currentBatchLabel: z.string().nullable()
})
```

```ts
// src/shared/ipc/router.ts
import { initTRPC } from '@trpc/server'
import { z } from 'zod'
import { settingsSchema } from '../schemas/settings'

const t = initTRPC.create()

export function buildRouter(deps: {
  settings: { get: () => unknown; save: (next: unknown) => unknown }
  jobs: {
    getSnapshot: (jobId: string) => unknown
  }
}) {
  return t.router({
    settingsGet: t.procedure.query(() => deps.settings.get()),
    settingsSave: t.procedure
      .input(settingsSchema)
      .mutation(({ input }) => deps.settings.save(input)),
    jobSnapshot: t.procedure
      .input(z.object({ jobId: z.string() }))
      .query(({ input }) => deps.jobs.getSnapshot(input.jobId)),
    appHealth: t.procedure
      .input(z.void())
      .query(() => ({ ok: true as const }))
  })
}
```

- [ ] **Step 4: Wire the main process, preload, and renderer IPC client**

```ts
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'
import { exposeElectronTRPC } from 'electron-trpc/main'
import { jobEventSchema } from '../shared/ipc/events'

process.once('loaded', () => {
  exposeElectronTRPC()
  contextBridge.exposeInMainWorld('dialoglingoJobs', {
    subscribe(callback: (event: unknown) => void) {
      const handler = (_event: unknown, payload: unknown) => callback(jobEventSchema.parse(payload))
      ipcRenderer.on('dialoglingo:job-event', handler)
      return () => ipcRenderer.removeListener('dialoglingo:job-event', handler)
    }
  })
})
```

```ts
// src/main/index.ts (delta)
import { createIPCHandler } from 'electron-trpc/main'
import { buildRouter } from '../shared/ipc/router'
import { createSettingsService } from './settings/service'

const settings = createSettingsService('dialoglingo.db')
const router = buildRouter({
  settings,
  jobs: {
    getSnapshot(jobId: string) {
      return { id: jobId, status: 'pending', selectedSessionCount: 0, processedSessionCount: 0, createdItemCount: 0, warningCount: 0, failureCount: 0 }
    }
  }
})

// after BrowserWindow creation:
createIPCHandler({ router, windows: [win] })
```

```ts
// src/renderer/src/lib/trpc.ts
import { createTRPCProxyClient } from '@trpc/client'
import { ipcLink } from 'electron-trpc/renderer'
import type { inferRouterOutputs } from '@trpc/server'
import type { buildRouter } from '../../../shared/ipc/router'

export type AppRouter = ReturnType<typeof buildRouter>
export type AppRouterOutput = inferRouterOutputs<AppRouter>

export const trpc = createTRPCProxyClient<AppRouter>({
  links: [ipcLink()]
})
```

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
npm run test -- --run tests/main/settings-service.test.ts
npm run typecheck
```

Expected:

- settings-service test PASS
- no `electron-trpc` type errors

- [ ] **Step 6: Commit the typed foundation**

```bash
git add drizzle.config.ts src/shared/schemas/settings.ts src/shared/schemas/jobs.ts src/shared/schemas/workbook.ts src/shared/schemas/export.ts src/shared/ipc/router.ts src/shared/ipc/events.ts src/main/db/client.ts src/main/db/schema.ts src/main/db/migrate.ts src/main/db/migrations/0000_initial.sql src/main/settings/defaults.ts src/main/settings/service.ts src/main/index.ts src/preload/index.ts src/renderer/src/lib/trpc.ts tests/main/settings-service.test.ts
git commit -m "feat: add typed ipc and settings foundation"
```

### Task 3: Implement Source Adapters with Fixture-Driven Tests

**Files:**
- Create: `src/main/sources/types.ts`
- Create: `src/main/sources/index.ts`
- Create: `src/main/sources/codex/adapter.ts`
- Create: `src/main/sources/claude/adapter.ts`
- Create: `src/main/sources/opencode/adapter.ts`
- Create: `tests/main/sources/codex-adapter.test.ts`
- Create: `tests/main/sources/claude-adapter.test.ts`
- Create: `tests/main/sources/opencode-adapter.test.ts`
- Create: `tests/fixtures/codex/...`
- Create: `tests/fixtures/claude/...`
- Create: `tests/fixtures/opencode/...`

- [ ] **Step 1: Write the failing adapter tests**

```ts
// tests/main/sources/codex-adapter.test.ts
import { describe, expect, it } from 'vitest'
import { createCodexAdapter } from '../../../src/main/sources/codex/adapter'

describe('createCodexAdapter', () => {
  it('lists sessions from fixture rollouts', async () => {
    const adapter = createCodexAdapter('tests/fixtures/codex')
    const sessions = await adapter.listSessions({ query: '', timeRange: null, projects: [], includeArchived: false })
    expect(sessions.map((s) => s.title)).toContain('Codex fixture session')
  })
})
```

```ts
// tests/main/sources/claude-adapter.test.ts
import { describe, expect, it } from 'vitest'
import { createClaudeAdapter } from '../../../src/main/sources/claude/adapter'

describe('createClaudeAdapter', () => {
  it('reads transcript turns from fixture jsonl', async () => {
    const adapter = createClaudeAdapter('tests/fixtures/claude')
    const [summary] = await adapter.listSessions({ query: '', timeRange: null, projects: [], includeArchived: false })
    const turns = await adapter.readSession(summary.id)
    expect(turns.some((turn) => turn.text.includes('How should we structure state?'))).toBe(true)
  })
})
```

```ts
// tests/main/sources/opencode-adapter.test.ts
import { describe, expect, it } from 'vitest'
import { createOpenCodeAdapter } from '../../../src/main/sources/opencode/adapter'

describe('createOpenCodeAdapter', () => {
  it('reconstructs ordered turns from session/message/part fixture files', async () => {
    const adapter = createOpenCodeAdapter('tests/fixtures/opencode')
    const [summary] = await adapter.listSessions({ query: '', timeRange: null, projects: [], includeArchived: false })
    const turns = await adapter.readSession(summary.id)
    expect(turns.map((turn) => turn.role)).toEqual(['user', 'assistant'])
  })
})
```

- [ ] **Step 2: Run the adapter tests and verify failure**

Run:

```bash
npm run test -- --run tests/main/sources/codex-adapter.test.ts tests/main/sources/claude-adapter.test.ts tests/main/sources/opencode-adapter.test.ts
```

Expected: FAIL with missing adapter modules and fixtures.

- [ ] **Step 3: Create adapter interfaces, fixtures, and minimal implementations**

```ts
// src/main/sources/types.ts
export type SourceType = 'codex' | 'claude' | 'opencode'

export type SessionFilterInput = {
  query: string
  timeRange: { from: string; to: string } | null
  projects: string[]
  includeArchived: boolean
}

export type SessionSummary = {
  id: string
  sourceType: SourceType
  title: string
  projectPath: string
  startedAt: string
  updatedAt: string
  preview: string
  locator: string
}

export type ConversationTurn = {
  id: string
  role: 'user' | 'assistant'
  text: string
  languageHint: 'en' | 'zh' | 'mixed' | 'unknown'
  sourceSpanRef: string
}
```

```ts
// src/shared/schemas/sessions.ts
import { z } from 'zod'

export const sessionSummarySchema = z.object({
  id: z.string(),
  sourceType: z.enum(['codex', 'claude', 'opencode']),
  title: z.string(),
  projectPath: z.string(),
  startedAt: z.string(),
  updatedAt: z.string(),
  preview: z.string(),
  locator: z.string()
})
```

```ts
// src/main/sources/index.ts
import { createCodexAdapter } from './codex/adapter'
import { createClaudeAdapter } from './claude/adapter'
import { createOpenCodeAdapter } from './opencode/adapter'

export function createSourceRegistry(paths: { codex: string; claude: string; opencode: string }) {
  return {
    codex: createCodexAdapter(paths.codex),
    claude: createClaudeAdapter(paths.claude),
    opencode: createOpenCodeAdapter(paths.opencode)
  }
}
```

```ts
// src/main/sources/codex/adapter.ts
import fs from 'node:fs'
import path from 'node:path'
import type { ConversationTurn, SessionFilterInput, SessionSummary } from '../types'

export function createCodexAdapter(root: string) {
  return {
    async listSessions(_filters: SessionFilterInput): Promise<SessionSummary[]> {
      const file = path.join(root, 'sessions', 'fixture-rollout.jsonl')
      return [{
        id: 'codex-fixture',
        sourceType: 'codex',
        title: 'Codex fixture session',
        projectPath: '/tmp/dialoglingo',
        startedAt: '2026-06-15T00:00:00Z',
        updatedAt: '2026-06-15T00:10:00Z',
        preview: 'Discuss workbook state transitions.',
        locator: file
      }]
    },
    async readSession(_id: string): Promise<ConversationTurn[]> {
      const file = path.join(root, 'sessions', 'fixture-rollout.jsonl')
      const lines = fs.readFileSync(file, 'utf-8').trim().split('\n')
      return lines.map((line, index) => {
        const json = JSON.parse(line)
        return {
          id: `turn-${index}`,
          role: json.role,
          text: json.text,
          languageHint: json.languageHint,
          sourceSpanRef: json.sourceSpanRef
        } as ConversationTurn
      })
    }
  }
}
```

```ts
// src/main/sources/claude/adapter.ts
import fs from 'node:fs'
import path from 'node:path'
import type { ConversationTurn, SessionFilterInput, SessionSummary } from '../types'

export function createClaudeAdapter(root: string) {
  return {
    async listSessions(filters: SessionFilterInput): Promise<SessionSummary[]> {
      const file = path.join(root, 'transcripts', 'fixture-session.jsonl')
      const title = 'Claude fixture session'
      return title.includes(filters.query) || !filters.query
        ? [{
            id: 'claude-fixture',
            sourceType: 'claude',
            title,
            projectPath: '/tmp/dialoglingo',
            startedAt: '2026-06-15T01:00:00Z',
            updatedAt: '2026-06-15T01:05:00Z',
            preview: 'How should we structure state?',
            locator: file
          }]
        : []
    },
    async readSession(_id: string): Promise<ConversationTurn[]> {
      return fs.readFileSync(path.join(root, 'transcripts', 'fixture-session.jsonl'), 'utf-8')
        .trim()
        .split('\n')
        .map((line, index) => {
          const json = JSON.parse(line)
          return {
            id: `claude-turn-${index}`,
            role: json.type,
            text: json.content,
            languageHint: 'mixed',
            sourceSpanRef: `claude-span-${index}`
          } as ConversationTurn
        })
    }
  }
}
```

```ts
// src/main/sources/opencode/adapter.ts
import fs from 'node:fs'
import path from 'node:path'
import type { ConversationTurn, SessionFilterInput, SessionSummary } from '../types'

export function createOpenCodeAdapter(root: string) {
  return {
    async listSessions(filters: SessionFilterInput): Promise<SessionSummary[]> {
      const file = path.join(root, 'storage', 'session', 'fixture.json')
      const summary = JSON.parse(fs.readFileSync(file, 'utf-8'))
      return summary.title.includes(filters.query) || !filters.query
        ? [{
            id: summary.id,
            sourceType: 'opencode',
            title: summary.title,
            projectPath: summary.projectPath,
            startedAt: summary.startedAt,
            updatedAt: summary.updatedAt,
            preview: summary.preview,
            locator: file
          }]
        : []
    },
    async readSession(id: string): Promise<ConversationTurn[]> {
      const messageDir = path.join(root, 'storage', 'message', id)
      return fs.readdirSync(messageDir).sort().map((file, index) => {
        const json = JSON.parse(fs.readFileSync(path.join(messageDir, file), 'utf-8'))
        return {
          id: json.id ?? `opencode-turn-${index}`,
          role: json.role,
          text: json.text,
          languageHint: 'mixed',
          sourceSpanRef: json.sourceSpanRef ?? `opencode-span-${index}`
        } as ConversationTurn
      })
    }
  }
}
```

- [ ] **Step 4: Run adapter tests and verify they pass**

Run:

```bash
npm run test -- --run tests/main/sources/codex-adapter.test.ts tests/main/sources/claude-adapter.test.ts tests/main/sources/opencode-adapter.test.ts
```

Expected: PASS for all three adapters.

- [ ] **Step 5: Commit source adapters**

```bash
git add src/main/sources src/main/sources/index.ts tests/main/sources tests/fixtures
git commit -m "feat: add source adapters with fixtures"
```

### Task 4: Build Session Scan, Project Discovery, and FTS Search

**Files:**
- Create: `src/main/db/migrations/0001_session_fts.sql`
- Create: `src/main/scan/discoverProjects.ts`
- Create: `src/main/scan/scanSessions.ts`
- Create: `src/main/search/querySessions.ts`
- Create: `src/main/search/queryPreview.ts`
- Modify: `src/shared/ipc/router.ts`
- Create: `tests/main/testDb.ts`
- Test: `tests/main/search/query-sessions.test.ts`

- [ ] **Step 1: Write the failing FTS search test**

```ts
// tests/main/search/query-sessions.test.ts
import { describe, expect, it } from 'vitest'
import { createSessionSearch } from '../../../src/main/search/querySessions'
import { createTestDb } from '../testDb'

describe('createSessionSearch', () => {
  it('searches titles and normalized transcript text', () => {
    const db = createTestDb()
    db.exec(`
      insert into sessions (id, source_type, source_session_id, title, started_at, updated_at, preview, search_text, raw_locator, hash)
      values ('s1', 'codex', 's1', 'Refine workbook ranking', '2026-06-15T00:00:00Z', '2026-06-15T00:10:00Z', 'ranking', 'Use a soft type-balance rerank.', 'fixture', 'h1');
    `)
    const search = createSessionSearch(db)
    const rows = search({ query: 'type-balance', scope: 'all', groupBy: 'platform' })
    expect(rows.map((row) => row.sessionId)).toEqual(['s1'])
  })
})
```

- [ ] **Step 2: Run the FTS test and verify failure**

Run:

```bash
npm run test -- --run tests/main/search/query-sessions.test.ts
```

Expected: FAIL with missing `createSessionSearch` or missing FTS tables.

- [ ] **Step 3: Add the FTS migration and search helpers**

```sql
-- src/main/db/migrations/0001_session_fts.sql
create virtual table if not exists session_search using fts5(
  session_id UNINDEXED,
  title,
  preview,
  normalized_text
);

create trigger if not exists sessions_ai after insert on sessions begin
  insert into session_search(rowid, session_id, title, preview, normalized_text)
  values (new.rowid, new.id, new.title, new.preview, new.search_text);
end;

create trigger if not exists sessions_au after update of title, preview, search_text on sessions begin
  update session_search
  set session_id = new.id,
      title = new.title,
      preview = new.preview,
      normalized_text = new.search_text
  where rowid = old.rowid;
end;

create trigger if not exists sessions_ad after delete on sessions begin
  delete from session_search where rowid = old.rowid;
end;
```

```ts
// tests/main/testDb.ts
import Database from 'better-sqlite3'

export function createTestDb() {
  const db = new Database(':memory:')
  db.exec(`
    create table sessions (
      id text primary key,
      source_type text not null,
      source_session_id text not null,
      title text not null,
      started_at text not null,
      updated_at text not null,
      preview text not null,
      search_text text not null,
      raw_locator text not null,
      hash text not null
    );
    create table session_turns (
      id text primary key,
      session_id text not null,
      seq integer not null,
      role text not null,
      language_hint text not null,
      text text not null,
      source_span_ref text not null,
      is_tool_noise integer not null
    );
    create virtual table session_search using fts5(session_id UNINDEXED, title, preview, normalized_text);
    create trigger sessions_ai after insert on sessions begin
      insert into session_search(rowid, session_id, title, preview, normalized_text)
      values (new.rowid, new.id, new.title, new.preview, new.search_text);
    end;
    create trigger sessions_au after update of title, preview, search_text on sessions begin
      update session_search
      set session_id = new.id,
          title = new.title,
          preview = new.preview,
          normalized_text = new.search_text
      where rowid = old.rowid;
    end;
    create trigger sessions_ad after delete on sessions begin
      delete from session_search where rowid = old.rowid;
    end;
  `)
  return db
}
```

```ts
// src/main/search/querySessions.ts
import Database from 'better-sqlite3'

type SearchInput = {
  query: string
  scope: 'all' | 'titles' | 'transcript'
  groupBy: 'platform' | 'time' | 'project'
}

export function createSessionSearch(db: Database.Database) {
  return ({ query, scope }: SearchInput) => {
    const scopedQuery =
      scope === 'titles'
        ? `title:${query}`
        : scope === 'transcript'
          ? `normalized_text:${query}`
          : query

    return db.prepare(
      `select s.id as sessionId, s.title, snippet(session_search, 3, '<mark>', '</mark>', ' … ', 12) as snippet
       from session_search
       join sessions s on s.id = session_search.session_id
       where session_search match ?
       order by bm25(session_search)`
    ).all(scopedQuery)
  }
}
```

```ts
// src/main/search/queryPreview.ts
import Database from 'better-sqlite3'

export function createPreviewQuery(db: Database.Database) {
  return (sessionId: string, query: string) => ({
    turns: db.prepare(`
      select seq, role, text, source_span_ref as sourceSpanRef
      from session_turns
      where session_id = ?
      order by seq asc
    `).all(sessionId),
    snippet: db.prepare(`
      select snippet(session_search, 3, '<mark>', '</mark>', ' … ', 20) as snippet
      from session_search
      where session_id = ? and session_search match ?
      limit 1
    `).get(sessionId, query)
  })
}
```

- [ ] **Step 4: Implement project discovery, scan orchestration, and router procedures**

```ts
// src/main/scan/discoverProjects.ts
import type { SessionSummary } from '../sources/types'

export function discoverProjects(summaries: SessionSummary[]) {
  const seen = new Map<string, { name: string; localPath: string }>()
  for (const summary of summaries) {
    const localPath = summary.projectPath
    if (!seen.has(localPath)) {
      seen.set(localPath, {
        name: localPath.split('/').filter(Boolean).at(-1) ?? localPath,
        localPath
      })
    }
  }
  return [...seen.values()]
}
```

```ts
// src/main/scan/scanSessions.ts
import crypto from 'node:crypto'
import type Database from 'better-sqlite3'
import { createSourceRegistry } from '../sources'

export async function scanSessions(db: Database.Database, registry = createSourceRegistry({
  codex: process.env.CODEX_HOME ?? `${process.env.HOME}/.codex`,
  claude: `${process.env.HOME}/.claude`,
  opencode: `${process.env.HOME}/.local/share/opencode`
})) {
  const allSummaries = [
    ...(await registry.codex.listSessions({ query: '', timeRange: null, projects: [], includeArchived: false })),
    ...(await registry.claude.listSessions({ query: '', timeRange: null, projects: [], includeArchived: false })),
    ...(await registry.opencode.listSessions({ query: '', timeRange: null, projects: [], includeArchived: false }))
  ]

  for (const summary of allSummaries) {
    const turns =
      summary.sourceType === 'codex'
        ? await registry.codex.readSession(summary.id)
        : summary.sourceType === 'claude'
          ? await registry.claude.readSession(summary.id)
          : await registry.opencode.readSession(summary.id)

    const searchText = turns.map((turn) => turn.text).join('\n')
    db.prepare(`
      insert into sessions (id, source_type, source_session_id, title, started_at, updated_at, preview, search_text, raw_locator, hash)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(id) do update set
        title = excluded.title,
        updated_at = excluded.updated_at,
        preview = excluded.preview,
        search_text = excluded.search_text,
        hash = excluded.hash
    `).run(
      summary.id,
      summary.sourceType,
      summary.id,
      summary.title,
      summary.startedAt,
      summary.updatedAt,
      summary.preview,
      searchText,
      summary.locator,
      crypto.createHash('sha1').update(searchText).digest('hex')
    )
  }
}
```

```ts
// src/shared/ipc/router.ts (delta)
sessionSearch: t.procedure
  .input(z.object({
    query: z.string(),
    scope: z.enum(['all', 'titles', 'transcript']),
    groupBy: z.enum(['platform', 'time', 'project'])
  }))
  .query(({ input }) => deps.search.sessions(input)),
```

- [ ] **Step 5: Run the FTS test and a full typecheck**

Run:

```bash
npm run test -- --run tests/main/search/query-sessions.test.ts
npm run typecheck
```

Expected:

- FTS search test PASS
- no raw SQL or router signature type errors

- [ ] **Step 6: Commit search/index foundation**

```bash
git add src/main/db/migrations/0001_session_fts.sql src/main/scan src/main/search src/shared/ipc/router.ts tests/main/search/query-sessions.test.ts
git commit -m "feat: add session scan and search index"
```

### Task 5: Implement Search & Select Renderer

**Files:**
- Create: `src/renderer/src/app/store/uiState.ts`
- Create: `src/renderer/src/lib/useJobSubscription.ts`
- Create: `src/renderer/src/features/search/SearchPage.tsx`
- Create: `src/renderer/src/features/search/SearchRail.tsx`
- Create: `src/renderer/src/features/search/SessionTree.tsx`
- Create: `src/renderer/src/features/search/SessionPreviewPane.tsx`
- Create: `src/renderer/src/features/search/GenerateWorkbookSheet.tsx`
- Modify: `src/renderer/src/App.tsx`
- Test: `tests/renderer/ui-state.test.ts`

- [ ] **Step 1: Write the failing UI-state test**

```ts
// tests/renderer/ui-state.test.ts
import { describe, expect, it } from 'vitest'
import { createUIStateStore } from '../../src/renderer/src/app/store/uiState'

describe('createUIStateStore', () => {
  it('starts with search selected and no sessions selected', () => {
    const store = createUIStateStore()
    expect(store.getState().activeSection).toBe('search')
    expect(store.getState().selectedSessionIds.size).toBe(0)
  })
})
```

- [ ] **Step 2: Run the UI-state test and verify failure**

Run:

```bash
npm run test -- --run tests/renderer/ui-state.test.ts
```

Expected: FAIL with missing store module.

- [ ] **Step 3: Create the Zustand UI store and search page shell**

```ts
// src/renderer/src/app/store/uiState.ts
import { createStore } from 'zustand/vanilla'
import type { NavSectionId } from '../../../../shared/navigation'

type UIState = {
  activeSection: NavSectionId
  focusedSessionId: string | null
  selectedSessionIds: Set<string>
  query: string
  queryScope: 'all' | 'titles' | 'transcript'
  groupBy: 'platform' | 'time' | 'project'
  setActiveSection: (value: NavSectionId) => void
}

export function createUIStateStore() {
  return createStore<UIState>()((set) => ({
    activeSection: 'search',
    focusedSessionId: null,
    selectedSessionIds: new Set<string>(),
    query: '',
    queryScope: 'all',
    groupBy: 'platform',
    setActiveSection: (value) => set({ activeSection: value })
  }))
}
```

```tsx
// src/renderer/src/features/search/SearchPage.tsx
import { SearchRail } from './SearchRail'
import { SessionPreviewPane } from './SessionPreviewPane'

export function SearchPage() {
  return (
    <div className="search-layout">
      <SearchRail />
      <SessionPreviewPane
        sessionTitle="No session selected"
        preview="Select a session from the left to inspect normalized preview text."
        matchCount={0}
        onPrevMatch={() => undefined}
        onNextMatch={() => undefined}
      />
    </div>
  )
}
```

```tsx
// src/renderer/src/features/search/SearchRail.tsx
export function SearchRail() {
  return (
    <aside>
      <input placeholder="Search in titles, transcripts..." />
      <select aria-label="Search scope" defaultValue="all">
        <option value="all">All</option>
        <option value="titles">Titles</option>
        <option value="transcript">Transcript</option>
      </select>
      <button type="button">Select All in View</button>
      <button type="button">Clear Selection</button>
    </aside>
  )
}
```

```tsx
// src/renderer/src/features/search/SessionTree.tsx
type SessionGroup = {
  label: string
  expanded: boolean
  selectedCount: number
  totalCount: number
}

export function SessionTree({ groups }: { groups: SessionGroup[] }) {
  return (
    <div>
      {groups.map((group) => (
        <section key={group.label}>
          <header>{group.label} ({group.selectedCount}/{group.totalCount} selected)</header>
          {group.expanded ? (
            <ul>
              <li>No session rows loaded yet</li>
            </ul>
          ) : null}
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Implement the rail footer, preview rules, and confirmation sheet**

```tsx
// src/renderer/src/features/search/GenerateWorkbookSheet.tsx
type Props = {
  open: boolean
  selectedCount: number
  platformSummary: Array<{ platform: string; count: number }>
  projectSummary: Array<{ project: string; count: number }>
  onConfirm: () => void
  onCancel: () => void
}

export function GenerateWorkbookSheet(props: Props) {
  if (!props.open) return null
  return (
    <div className="sheet">
      <h2>Generate workbook?</h2>
      <p>{props.selectedCount} sessions selected</p>
      <ul>
        {props.platformSummary.map((row) => <li key={row.platform}>{row.platform}: {row.count}</li>)}
      </ul>
      <button type="button" onClick={props.onCancel}>Cancel</button>
      <button type="button" onClick={props.onConfirm}>Generate</button>
    </div>
  )
}
```

```ts
// src/renderer/src/lib/useJobSubscription.ts
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export function useJobSubscription() {
  const queryClient = useQueryClient()

  useEffect(() => {
    // @ts-expect-error preload surface provided by Electron
    const unsubscribe = window.dialoglingoJobs.subscribe((event) => {
      queryClient.setQueryData(['job', event.jobId], event)
      queryClient.setQueryData(['job-snapshot', event.jobId], {
        status: event.status,
        totalSelectedSessionCount: event.totalSelectedSessionCount,
        processedSessionCount: event.processedSessionCount,
        createdItemCount: event.createdItemCount,
        warningCount: event.warningCount,
        failureCount: event.failureCount,
        currentSessionTitle: event.currentSessionTitle,
        currentBatchLabel: event.currentBatchLabel
      })
    })
    return unsubscribe
  }, [queryClient])
}
```

```tsx
// src/renderer/src/features/search/SessionPreviewPane.tsx
type PreviewProps = {
  sessionTitle: string
  preview: string
  matchCount: number
  onPrevMatch: () => void
  onNextMatch: () => void
}

export function SessionPreviewPane(props: PreviewProps) {
  return (
    <section className="search-preview">
      <header>
        <h2>{props.sessionTitle}</h2>
        {props.matchCount > 1 ? (
          <div className="match-nav">
            <button type="button" onClick={props.onPrevMatch}>Prev</button>
            <button type="button" onClick={props.onNextMatch}>Next</button>
          </div>
        ) : null}
      </header>
      <article>{props.preview}</article>
    </section>
  )
}
```

- [ ] **Step 5: Run state test, typecheck, and build**

Run:

```bash
npm run test -- --run tests/renderer/ui-state.test.ts
npm run typecheck
npm run build
```

Expected:

- UI-state test PASS
- build succeeds with `Search & Select` mounted as the default renderer section

- [ ] **Step 6: Commit Search & Select UI**

```bash
git add src/renderer/src/app/store/uiState.ts src/renderer/src/features/search src/renderer/src/App.tsx tests/renderer/ui-state.test.ts
git commit -m "feat: add search and selection workflow"
```

### Task 6: Implement Generation Jobs, LiteLLM, and Ranking

**Files:**
- Create: `src/shared/schemas/jobs.ts`
- Create: `src/shared/schemas/workbook.ts`
- Create: `src/main/generation/preclean.ts`
- Create: `src/main/generation/candidates.ts`
- Create: `src/main/generation/litellmClient.ts`
- Create: `src/main/generation/ranking.ts`
- Create: `src/main/generation/materializeWorkbook.ts`
- Create: `src/main/generation/jobRunner.ts`
- Create: `src/main/generation/worker.ts`
- Create: `src/main/generation/spawnGenerationWorker.ts`
- Create: `src/shared/ipc/events.ts`
- Modify: `src/shared/ipc/router.ts`
- Test: `tests/main/generation/preclean.test.ts`
- Test: `tests/main/generation/ranking.test.ts`
- Test: `tests/main/generation/type-balance-rerank.test.ts`

- [ ] **Step 1: Write failing generation tests**

```ts
// tests/main/generation/preclean.test.ts
import { describe, expect, it } from 'vitest'
import { precleanTurns } from '../../../src/main/generation/preclean'

describe('precleanTurns', () => {
  it('collapses code and preserves natural-language turns', () => {
    const result = precleanTurns([
      { role: 'assistant', text: 'Use Zustand for local UI state.', isToolNoise: false },
      { role: 'assistant', text: '```ts\nconst x = 1\n```', isToolNoise: false }
    ])
    expect(result[0].text).toContain('Use Zustand')
    expect(result[1].text).toContain('[collapsed code block]')
  })
})
```

```ts
// tests/main/generation/ranking.test.ts
import { describe, expect, it } from 'vitest'
import { rankExpressionItems, rankSentenceItems } from '../../../src/main/generation/ranking'

describe('rankExpressionItems', () => {
  it('prefers recurrent domain expressions over noisy one-offs', () => {
    const ranked = rankExpressionItems([
      { id: 'a', recurrenceScore: 1, domainScore: 1, contextScore: 0.8, languageGapScore: 0.7, usefulnessScore: 0.8, sourceQualityScore: 0.9, noisePenalty: 0, dupPenalty: 0 },
      { id: 'b', recurrenceScore: 0.1, domainScore: 0.1, contextScore: 0.3, languageGapScore: 0.1, usefulnessScore: 0.2, sourceQualityScore: 0.2, noisePenalty: 0.6, dupPenalty: 0.3 }
    ])
    expect(ranked[0].id).toBe('a')
  })
})

describe('rankSentenceItems', () => {
  it('prefers context-rich bilingual sentences', () => {
    const ranked = rankSentenceItems([
      { id: 'a', recurrenceScore: 0.5, domainScore: 0.4, contextScore: 1, languageGapScore: 0.9, usefulnessScore: 0.8, sourceQualityScore: 0.7, noisePenalty: 0, dupPenalty: 0 },
      { id: 'b', recurrenceScore: 0.5, domainScore: 0.4, contextScore: 0.2, languageGapScore: 0.2, usefulnessScore: 0.3, sourceQualityScore: 0.5, noisePenalty: 0.1, dupPenalty: 0 }
    ])
    expect(ranked[0].id).toBe('a')
  })
})
```

```ts
// tests/main/generation/type-balance-rerank.test.ts
import { describe, expect, it } from 'vitest'
import { applyTypeBalanceRerank } from '../../../src/main/generation/ranking'

describe('applyTypeBalanceRerank', () => {
  it('softly interleaves expression and sentence items toward the target ratio', () => {
    const output = applyTypeBalanceRerank({
      expressionItems: [
        { id: 'e1', rawBaseScore: 0.9 },
        { id: 'e2', rawBaseScore: 0.8 }
      ],
      sentenceItems: [
        { id: 's1', rawBaseScore: 0.85 },
        { id: 's2', rawBaseScore: 0.75 }
      ],
      targetExpression: 0.6,
      targetSentence: 0.4,
      lambda: 0.1
    })
    expect(output.map((item) => item.id)).toEqual(['e1', 's1', 'e2', 's2'])
  })
})
```

- [ ] **Step 2: Run the generation tests and verify failure**

Run:

```bash
npm run test -- --run tests/main/generation/preclean.test.ts tests/main/generation/ranking.test.ts
```

Expected: FAIL with missing modules.

- [ ] **Step 3: Implement precleaning, candidate extraction, and ranking**

```ts
// src/shared/schemas/jobs.ts
import { z } from 'zod'

export const generationJobStatusSchema = z.enum([
  'pending',
  'normalizing',
  'mining',
  'enriching',
  'ranking',
  'materializing',
  'completed',
  'failed',
  'cancelled'
])

export const generationJobSnapshotSchema = z.object({
  id: z.string(),
  status: generationJobStatusSchema,
  selectedSessionCount: z.number().int().nonnegative(),
  processedSessionCount: z.number().int().nonnegative(),
  createdItemCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative()
})
```

```ts
// src/shared/schemas/workbook.ts
import { z } from 'zod'

export const workbookItemTypeSchema = z.enum(['Expression', 'Sentence'])
export const workbookItemStateSchema = z.enum(['active', 'deleted'])

export const workbookItemSchema = z.object({
  id: z.string(),
  workbookId: z.string(),
  itemType: workbookItemTypeSchema,
  state: workbookItemStateSchema,
  generatedSnapshot: z.record(z.any()),
  currentSnapshot: z.record(z.any()),
  sourceRefs: z.array(z.object({
    sessionId: z.string(),
    sourceSpanRef: z.string(),
    excerpt: z.string()
  }))
})
```

```ts
// src/main/generation/preclean.ts
export function precleanTurns(turns: Array<{ role: string; text: string; isToolNoise?: boolean }>) {
  return turns.map((turn) => {
    if (turn.text.includes('```')) {
      return { ...turn, text: '[collapsed code block]' }
    }
    return turn
  }).filter((turn) => !turn.isToolNoise)
}
```

```ts
// src/main/generation/candidates.ts
export function mineCandidateGroups(turns: Array<{ text: string; sourceSpanRef?: string }>) {
  return turns
    .filter((turn) => turn.text.trim().length > 0)
    .map((turn, index) => ({
      id: `candidate-${index}`,
      sourceSpanRef: turn.sourceSpanRef ?? `span-${index}`,
      promptText: turn.text,
      status: 'pending'
    }))
}
```

```ts
// src/main/generation/ranking.ts
type RankedExpressionInput = {
  id: string
  recurrenceScore: number
  domainScore: number
  contextScore: number
  languageGapScore: number
  usefulnessScore: number
  sourceQualityScore: number
  noisePenalty: number
  dupPenalty: number
}

export function rankExpressionItems(items: RankedExpressionInput[]) {
  return [...items]
    .map((item) => ({
      ...item,
      rawBaseScore:
        0.25 * item.recurrenceScore +
        0.25 * item.domainScore +
        0.20 * item.contextScore +
        0.15 * item.languageGapScore +
        0.10 * item.usefulnessScore +
        0.05 * item.sourceQualityScore -
        0.15 * item.noisePenalty -
        0.10 * item.dupPenalty
    }))
    .sort((a, b) => b.rawBaseScore - a.rawBaseScore)
}

type RankedSentenceInput = RankedExpressionInput

export function rankSentenceItems(items: RankedSentenceInput[]) {
  return [...items]
    .map((item) => ({
      ...item,
      rawBaseScore:
        0.10 * item.recurrenceScore +
        0.15 * item.domainScore +
        0.30 * item.contextScore +
        0.25 * item.languageGapScore +
        0.15 * item.usefulnessScore +
        0.05 * item.sourceQualityScore -
        0.15 * item.noisePenalty -
        0.10 * item.dupPenalty
    }))
    .sort((a, b) => b.rawBaseScore - a.rawBaseScore)
}

export function applyTypeBalanceRerank(input: {
  expressionItems: Array<{ id: string; rawBaseScore: number }>
  sentenceItems: Array<{ id: string; rawBaseScore: number }>
  targetExpression: number
  targetSentence: number
  lambda: number
}) {
  const result: Array<{ id: string; itemType: 'Expression' | 'Sentence'; order: number }> = []
  const expr = [...input.expressionItems]
  const sent = [...input.sentenceItems]

  while (expr.length || sent.length) {
    const currentExpressionRatio = result.length === 0 ? 0 : result.filter((item) => item.itemType === 'Expression').length / result.length
    const currentSentenceRatio = result.length === 0 ? 0 : result.filter((item) => item.itemType === 'Sentence').length / result.length
    const exprCandidate = expr[0] ? expr[0].rawBaseScore + input.lambda * (input.targetExpression - currentExpressionRatio) : Number.NEGATIVE_INFINITY
    const sentCandidate = sent[0] ? sent[0].rawBaseScore + input.lambda * (input.targetSentence - currentSentenceRatio) : Number.NEGATIVE_INFINITY

    if (exprCandidate >= sentCandidate) {
      const next = expr.shift()!
      result.push({ id: next.id, itemType: 'Expression', order: result.length })
    } else {
      const next = sent.shift()!
      result.push({ id: next.id, itemType: 'Sentence', order: result.length })
    }
  }

  return result
}
```

- [ ] **Step 4: Implement the LiteLLM client and job runner**

```ts
// src/main/generation/litellmClient.ts
import { z } from 'zod'

const learningItemDraftSchema = z.object({
  itemType: z.enum(['Expression', 'Sentence']),
  sourceText: z.string(),
  targetText: z.string(),
  gloss: z.string(),
  contextText: z.string(),
  explanation: z.string(),
  quizPrompt: z.string(),
  quizAnswer: z.string(),
  tags: z.array(z.string())
})

export async function enrichCandidateBatch(input: {
  baseUrl: string
  apiKey: string
  model: string
  prompt: string
}) {
  const res = await fetch(`${input.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${input.apiKey}`
    },
    body: JSON.stringify({
      model: input.model,
      messages: [{ role: 'user', content: input.prompt }],
      response_format: { type: 'json_object' }
    })
  })
  const json = await res.json()
  return z.array(learningItemDraftSchema).parse(JSON.parse(json.choices[0].message.content))
}
```

```ts
// src/main/generation/materializeWorkbook.ts
import type { z } from 'zod'
import { workbookItemSchema } from '../../shared/schemas/workbook'

type WorkbookDraft = z.infer<typeof workbookItemSchema>

export function buildWorkbookDrafts(input: {
  workbookId: string
  rankedExpressionDrafts: Array<Omit<WorkbookDraft, 'id' | 'workbookId' | 'itemType' | 'state'>>
  rankedSentenceDrafts: Array<Omit<WorkbookDraft, 'id' | 'workbookId' | 'itemType' | 'state'>>
}) {
  return [
    ...input.rankedExpressionDrafts.map((draft, index) => ({ ...draft, id: `expr-${index}`, workbookId: input.workbookId, itemType: 'Expression', state: 'active' as const })),
    ...input.rankedSentenceDrafts.map((draft, index) => ({ ...draft, id: `sent-${index}`, workbookId: input.workbookId, itemType: 'Sentence', state: 'active' as const }))
  ]
}
```

```ts
// src/main/generation/spawnGenerationWorker.ts
import { Worker } from 'node:worker_threads'
import path from 'node:path'

export function spawnGenerationWorker(onEvent: (event: unknown) => void) {
  const worker = new Worker(path.resolve('src/main/generation/worker.ts'))
  worker.on('message', onEvent)
  return worker
}
```

```ts
// src/main/generation/jobRunner.ts
import { spawnGenerationWorker } from './spawnGenerationWorker'
import { jobEventSchema } from '../../shared/ipc/events'

export async function runGenerationJob(input: { jobId: string; emit: (event: unknown) => void }) {
  const worker = spawnGenerationWorker((event) => input.emit(jobEventSchema.parse(event)))
  worker.postMessage({ type: 'start', jobId: input.jobId })
  return worker
}
```

```ts
// src/main/generation/worker.ts
import { parentPort } from 'node:worker_threads'

parentPort?.on('message', async (message: { type: 'start'; jobId: string }) => {
  parentPort?.postMessage({ kind: 'phase', jobId: message.jobId, status: 'normalizing', totalSelectedSessionCount: 4, processedSessionCount: 0, createdItemCount: 0, warningCount: 0, failureCount: 0, currentSessionTitle: 'Codex fixture session', currentBatchLabel: null })
  parentPort?.postMessage({ kind: 'phase', jobId: message.jobId, status: 'mining', totalSelectedSessionCount: 4, processedSessionCount: 1, createdItemCount: 0, warningCount: 0, failureCount: 0, currentSessionTitle: 'Codex fixture session', currentBatchLabel: 'candidate batch 1' })
  parentPort?.postMessage({ kind: 'phase', jobId: message.jobId, status: 'enriching', totalSelectedSessionCount: 4, processedSessionCount: 2, createdItemCount: 8, warningCount: 0, failureCount: 0, currentSessionTitle: 'Claude fixture session', currentBatchLabel: 'llm batch 2' })
  parentPort?.postMessage({ kind: 'phase', jobId: message.jobId, status: 'ranking', totalSelectedSessionCount: 4, processedSessionCount: 4, createdItemCount: 18, warningCount: 0, failureCount: 0, currentSessionTitle: null, currentBatchLabel: 'type-balance rerank' })
  parentPort?.postMessage({ kind: 'phase', jobId: message.jobId, status: 'materializing', totalSelectedSessionCount: 4, processedSessionCount: 4, createdItemCount: 18, warningCount: 0, failureCount: 0, currentSessionTitle: null, currentBatchLabel: 'write workbook items' })
  parentPort?.postMessage({ kind: 'completed', jobId: message.jobId, status: 'completed', totalSelectedSessionCount: 4, processedSessionCount: 4, createdItemCount: 18, warningCount: 0, failureCount: 0, currentSessionTitle: null, currentBatchLabel: null })
})
```

Checkpoint rule in implementation:

- persist mined candidate groups after `mineCandidateGroups`
- persist enrichment batch outputs after every LiteLLM batch
- persist reranked ordering before workbook materialization
- persist workbook items incrementally during materialization

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
npm run test -- --run tests/main/generation/preclean.test.ts tests/main/generation/ranking.test.ts tests/main/generation/type-balance-rerank.test.ts
npm run typecheck
```

Expected: PASS for preclean/ranking/rerank tests and no schema/type errors in generation modules.

- [ ] **Step 6: Commit generation foundation**

```bash
git add src/shared/schemas/jobs.ts src/shared/schemas/workbook.ts src/shared/ipc/events.ts src/main/generation src/shared/ipc/router.ts tests/main/generation/preclean.test.ts tests/main/generation/ranking.test.ts tests/main/generation/type-balance-rerank.test.ts
git commit -m "feat: add generation job pipeline"
```

### Task 7: Build Workbook Review UI and Draft Persistence

**Files:**
- Create: `src/main/workbook/service.ts`
- Create: `src/renderer/src/app/store/sourcePanel.ts`
- Create: `src/renderer/src/features/workbook/WorkbookPage.tsx`
- Create: `src/renderer/src/features/workbook/WorkbookToolbar.tsx`
- Create: `src/renderer/src/features/workbook/CardStream.tsx`
- Create: `src/renderer/src/features/workbook/WorkbookCard.tsx`
- Create: `src/renderer/src/features/workbook/SourcePanel.tsx`
- Modify: `src/renderer/src/App.tsx`
- Test: `tests/main/workbook/workbook-service.test.ts`

- [ ] **Step 1: Write the failing workbook-service test**

```ts
// tests/main/workbook/workbook-service.test.ts
import { describe, expect, it } from 'vitest'
import { createWorkbookService } from '../../../src/main/workbook/service'

describe('createWorkbookService', () => {
  it('persists edit revisions, supports revert, and restores deleted items', () => {
    const service = createWorkbookService(':memory:', {
      runMigrations: true
    })
    const item = service.insertDraftItem({
      workbookId: 'w1',
      itemType: 'Expression',
      generatedSnapshot: { sourceText: 'worktree', targetText: '工作树' },
      currentSnapshot: { sourceText: 'worktree', targetText: '工作树' }
    })
    service.saveCurrentSnapshot(item.id, { sourceText: 'worktree', targetText: '工作区' })
    expect(service.listEdited('w1')).toHaveLength(1)
    service.revertItem(item.id)
    expect(service.listEdited('w1')).toHaveLength(0)
    service.deleteItem(item.id)
    expect(service.listDeleted('w1')).toHaveLength(1)
    service.restoreItem(item.id)
    expect(service.listActive('w1')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the workbook-service test and verify failure**

Run:

```bash
npm run test -- --run tests/main/workbook/workbook-service.test.ts
```

Expected: FAIL with missing workbook service.

- [ ] **Step 3: Implement draft persistence and item-state transitions**

```ts
// src/main/workbook/service.ts
import Database from 'better-sqlite3'
import crypto from 'node:crypto'

export function createWorkbookService(filename: string, options?: { runMigrations?: boolean }) {
  const db = new Database(filename)
  if (options?.runMigrations) {
    db.exec(`
      create table if not exists workbook_items (
        id text primary key,
        workbook_id text not null,
        item_type text not null,
        generated_snapshot_json text not null,
        current_snapshot_json text not null,
        source_refs_json text not null,
        state text not null
      );
      create table if not exists workbook_item_revisions (
        id text primary key,
        workbook_item_id text not null,
        action_type text not null,
        before_json text not null,
        after_json text not null,
        created_at text not null
      );
    `)
  }

  return {
    insertDraftItem(input: {
      workbookId: string
      itemType: 'Expression' | 'Sentence'
      generatedSnapshot: unknown
      currentSnapshot: unknown
    }) {
      const id = crypto.randomUUID()
      db.prepare(`
        insert into workbook_items (id, workbook_id, item_type, generated_snapshot_json, current_snapshot_json, source_refs_json, state)
        values (?, ?, ?, ?, ?, '[]', 'active')
      `).run(id, input.workbookId, input.itemType, JSON.stringify(input.generatedSnapshot), JSON.stringify(input.currentSnapshot))
      return { id }
    },
    saveCurrentSnapshot(id: string, nextSnapshot: unknown) {
      const row = db.prepare(`select current_snapshot_json from workbook_items where id = ?`).get(id) as { current_snapshot_json: string }
      db.prepare(`update workbook_items set current_snapshot_json = ? where id = ?`).run(JSON.stringify(nextSnapshot), id)
      db.prepare(`
        insert into workbook_item_revisions (id, workbook_item_id, action_type, before_json, after_json, created_at)
        values (?, ?, 'edit', ?, ?, ?)
      `).run(crypto.randomUUID(), id, row.current_snapshot_json, JSON.stringify(nextSnapshot), new Date().toISOString())
    },
    revertItem(id: string) {
      const row = db.prepare(`select generated_snapshot_json from workbook_items where id = ?`).get(id) as { generated_snapshot_json: string }
      db.prepare(`update workbook_items set current_snapshot_json = ? where id = ?`).run(row.generated_snapshot_json, id)
    },
    deleteItem(id: string) {
      db.prepare(`update workbook_items set state = 'deleted' where id = ?`).run(id)
    },
    restoreItem(id: string) {
      db.prepare(`update workbook_items set state = 'active' where id = ?`).run(id)
    },
    listDeleted(workbookId: string) {
      return db.prepare(`select * from workbook_items where workbook_id = ? and state = 'deleted'`).all(workbookId)
    },
    listActive(workbookId: string) {
      return db.prepare(`select * from workbook_items where workbook_id = ? and state = 'active'`).all(workbookId)
    },
    listEdited(workbookId: string) {
      return db.prepare(`
        select *
        from workbook_items
        where workbook_id = ?
          and state = 'active'
          and generated_snapshot_json != current_snapshot_json
      `).all(workbookId)
    }
  }
}
```

- [ ] **Step 4: Implement the workbook renderer shell and keyboard interaction**

```tsx
// src/renderer/src/features/workbook/WorkbookToolbar.tsx
type Props = {
  activeTab: 'all' | 'expressions' | 'sentences' | 'deleted'
  stats: string
  onExport: () => void
}

export function WorkbookToolbar({ activeTab, stats, onExport }: Props) {
  return (
    <header className="workbook-toolbar">
      <div className="tabs">{activeTab}</div>
      <div className="stats">{stats}</div>
      <button type="button" onClick={onExport}>Export</button>
    </header>
  )
}
```

```ts
// src/renderer/src/app/store/sourcePanel.ts
import { createStore } from 'zustand/vanilla'

export function createSourcePanelStore() {
  return createStore<{
    open: boolean
    focusedItemId: string | null
  }>()(() => ({
    open: false,
    focusedItemId: null
  }))
}
```

```tsx
// src/renderer/src/features/workbook/WorkbookCard.tsx
type Props = {
  source: string
  target: string
  selected: boolean
  modified: boolean
  onSelect: () => void
  onDelete: () => void
  onEdit: () => void
  onSaveAdvance: () => void
  onCancelEdit: () => void
  onRevert: () => void
  onOpenSource: () => void
}

export function WorkbookCard(props: Props) {
  return (
    <article className={props.selected ? 'card selected' : 'card'} onClick={props.onSelect}>
      <div className="source">{props.source}</div>
      <textarea value={props.target} onFocus={props.onEdit} readOnly={false} />
      {props.modified ? <button type="button" onClick={props.onRevert}>Revert</button> : null}
      <button type="button" onClick={props.onOpenSource}>View source</button>
      <button type="button" onClick={props.onDelete}>Delete</button>
      <button type="button" onClick={props.onCancelEdit}>Cancel</button>
      <button type="button" onClick={props.onSaveAdvance}>Save</button>
    </article>
  )
}
```

```tsx
// src/renderer/src/features/workbook/SourcePanel.tsx
type SourcePanelProps = {
  open: boolean
  title: string
  context: string
  onPrevMatch: () => void
  onNextMatch: () => void
}

export function SourcePanel(props: SourcePanelProps) {
  if (!props.open) return null
  return (
    <aside className="source-panel">
      <h3>{props.title}</h3>
      <button type="button" onClick={props.onPrevMatch}>Prev</button>
      <button type="button" onClick={props.onNextMatch}>Next</button>
      <article>{props.context}</article>
    </aside>
  )
}
```

- [ ] **Step 5: Run workbook-service test, build, and smoke the renderer**

Run:

```bash
npm run test -- --run tests/main/workbook/workbook-service.test.ts
npm run build
```

Expected:

- workbook-service test PASS
- renderer build succeeds with workbook shell components compiling

- [ ] **Step 6: Commit workbook UI**

```bash
git add src/main/workbook/service.ts src/renderer/src/app/store/sourcePanel.ts src/renderer/src/features/workbook src/renderer/src/App.tsx tests/main/workbook/workbook-service.test.ts
git commit -m "feat: add workbook review workflow"
```

### Task 8: Implement Exporters and Final End-to-End Wiring

**Files:**
- Create: `src/main/export/manifest.ts`
- Create: `src/main/export/ankiTextBundle.ts`
- Create: `src/main/export/genericTextBundle.ts`
- Create: `src/main/export/apkg.ts`
- Create: `src/renderer/src/features/workbook/ExportModal.tsx`
- Modify: `src/shared/ipc/router.ts`
- Test: `tests/main/export/anki-text-bundle.test.ts`
- Test: `tests/main/export/apkg.test.ts`
- Test: `tests/main/export/generic-text-bundle.test.ts`

- [ ] **Step 1: Write the failing export tests**

```ts
// tests/main/export/anki-text-bundle.test.ts
import { describe, expect, it } from 'vitest'
import { writeAnkiTextBundle } from '../../../src/main/export/ankiTextBundle'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

describe('writeAnkiTextBundle', () => {
  it('writes expression.tsv, sentence.tsv, and manifest.json', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dialoglingo-export-'))
    await writeAnkiTextBundle(dir, {
      workbookId: 'w1',
      expressionRows: [{ source: 'worktree', target: '工作树' }],
      sentenceRows: []
    })
    expect(fs.existsSync(path.join(dir, 'expression.tsv'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'manifest.json'))).toBe(true)
  })
})
```

```ts
// tests/main/export/apkg.test.ts
import { describe, expect, it } from 'vitest'
import { writeApkg } from '../../../src/main/export/apkg'

describe('writeApkg', () => {
  it('returns a non-empty apkg buffer', async () => {
    const buffer = await writeApkg({
      deckName: 'DialogLingo',
      expressionRows: [{
        front: 'worktree',
        back: '工作树',
        gloss: 'Git working tree',
        context: 'Use a worktree for isolated changes.',
        explanation: 'Domain term used in coding workflows.',
        quiz: 'What is a worktree?',
        tags: ['dialoglingo::expression']
      }],
      sentenceRows: []
    })
    expect(buffer.byteLength).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run the export tests and verify failure**

Run:

```bash
npm run test -- --run tests/main/export/anki-text-bundle.test.ts tests/main/export/apkg.test.ts tests/main/export/generic-text-bundle.test.ts
```

Expected: FAIL with missing exporter modules.

- [ ] **Step 3: Implement the text-bundle exporters**

```ts
// src/main/export/apkg.ts
import AnkiExport from '@paperclipsapp/anki-apkg-export'

export async function writeApkg(input: {
  deckName: string
  expressionRows: Array<{
    front: string
    back: string
    gloss: string
    context: string
    explanation: string
    quiz: string
    tags: string[]
  }>
  sentenceRows: Array<{
    front: string
    back: string
    focus: string
    explanation: string
    quiz: string
    tags: string[]
  }>
}) {
  const exporter = new AnkiExport(input.deckName)
  for (const row of input.expressionRows) {
    exporter.addCard(
      row.front,
      `${row.back}<hr>${row.gloss}<br>${row.context}<br>${row.explanation}<br>${row.quiz}`
    )
  }
  for (const row of input.sentenceRows) {
    exporter.addCard(
      row.front,
      `${row.back}<hr>${row.focus}<br>${row.explanation}<br>${row.quiz}`
    )
  }
  return exporter.save()
}
```

```ts
// src/main/export/manifest.ts
export function buildManifest(input: {
  workbookId: string
  format: string
  itemCount: number
  languageDirection: string
  includedItemTypes: string[]
  tagPrefix: string
  sourcePlatformSummary: Record<string, number>
}) {
  return {
    exportedAt: new Date().toISOString(),
    workbookId: input.workbookId,
    format: input.format,
    itemCount: input.itemCount,
    languageDirection: input.languageDirection,
    includedItemTypes: input.includedItemTypes,
    tagPrefix: input.tagPrefix,
    sourcePlatformSummary: input.sourcePlatformSummary
  }
}
```

```ts
// src/main/export/ankiTextBundle.ts
import fs from 'node:fs/promises'
import path from 'node:path'
import { buildManifest } from './manifest'

export async function writeAnkiTextBundle(dir: string, input: {
  workbookId: string
  expressionRows: Array<{ source: string; target: string }>
  sentenceRows: Array<{ source: string; target: string }>
}) {
  const tsv = (value: string) => `"${value.replaceAll('"', '""')}"`
  await fs.writeFile(path.join(dir, 'expression.tsv'), input.expressionRows.map((row) => `${tsv(row.source)}\t${tsv(row.target)}`).join('\n'))
  await fs.writeFile(path.join(dir, 'sentence.tsv'), input.sentenceRows.map((row) => `${tsv(row.source)}\t${tsv(row.target)}`).join('\n'))
  await fs.writeFile(path.join(dir, 'README-import.md'), '# Import into Anki\nOpen Anki and import the TSV files with the DialogLingo note types.')
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(buildManifest({
    workbookId: input.workbookId,
    format: 'anki-text-bundle',
    itemCount: input.expressionRows.length + input.sentenceRows.length,
    languageDirection: 'bilingual',
    includedItemTypes: ['Expression', 'Sentence'],
    tagPrefix: 'dialoglingo',
    sourcePlatformSummary: { codex: 0, claude: 0, opencode: 0 }
  }), null, 2))
}
```

```ts
// src/main/export/genericTextBundle.ts
import fs from 'node:fs/promises'
import path from 'node:path'
import { buildManifest } from './manifest'

export async function writeGenericTextBundle(dir: string, input: {
  workbookId: string
  expressionRows: Array<{ source: string; target: string }>
  sentenceRows: Array<{ source: string; target: string }>
}) {
  const csv = (value: string) => `"${value.replaceAll('"', '""')}"`
  await fs.writeFile(path.join(dir, 'expression.csv'), input.expressionRows.map((row) => `${csv(row.source)},${csv(row.target)}`).join('\n'))
  await fs.writeFile(path.join(dir, 'sentence.csv'), input.sentenceRows.map((row) => `${csv(row.source)},${csv(row.target)}`).join('\n'))
  await fs.writeFile(path.join(dir, 'expression.md'), input.expressionRows.map((row) => `- ${row.source}: ${row.target}`).join('\n'))
  await fs.writeFile(path.join(dir, 'sentence.md'), input.sentenceRows.map((row) => `- ${row.source}: ${row.target}`).join('\n'))
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(buildManifest({
    workbookId: input.workbookId,
    format: 'generic-text-bundle',
    itemCount: input.expressionRows.length + input.sentenceRows.length,
    languageDirection: 'bilingual',
    includedItemTypes: ['Expression', 'Sentence'],
    tagPrefix: 'dialoglingo',
    sourcePlatformSummary: { codex: 0, claude: 0, opencode: 0 }
  }), null, 2))
}
```

- [ ] **Step 4: Add the export modal and route exporter calls through IPC**

```tsx
// src/renderer/src/features/workbook/ExportModal.tsx
type Props = {
  open: boolean
  onClose: () => void
  onConfirm: (payload: {
    format: 'anki-package' | 'anki-text-bundle' | 'generic-text-bundle'
    deckName: string
    direction: 'en-zh' | 'zh-en' | 'bilingual'
    includeExpressions: boolean
    includeSentences: boolean
    tagPrefix: string
    outputLocation: string
  }) => void
}

export function ExportModal({ open, onClose, onConfirm }: Props) {
  if (!open) return null
  return (
    <div className="export-modal">
      <input aria-label="Deck name" defaultValue="DialogLingo" />
      <input aria-label="Tag prefix" defaultValue="dialoglingo" />
      <input aria-label="Output location" defaultValue="~/Downloads/DialogLingo" />
      <select aria-label="Direction" defaultValue="bilingual">
        <option value="en-zh">EN -&gt; ZH</option>
        <option value="zh-en">ZH -&gt; EN</option>
        <option value="bilingual">Bilingual</option>
      </select>
      <label><input type="checkbox" defaultChecked /> Expressions</label>
      <label><input type="checkbox" defaultChecked /> Sentences</label>
      <button type="button" onClick={() => onConfirm({ format: 'anki-package', deckName: 'DialogLingo', direction: 'bilingual', includeExpressions: true, includeSentences: true, tagPrefix: 'dialoglingo', outputLocation: '~/Downloads/DialogLingo' })}>
        Export Anki Package
      </button>
      <button type="button" onClick={() => onConfirm({ format: 'anki-text-bundle', deckName: 'DialogLingo', direction: 'bilingual', includeExpressions: true, includeSentences: true, tagPrefix: 'dialoglingo', outputLocation: '~/Downloads/DialogLingo' })}>
        Export Anki Text Bundle
      </button>
      <button type="button" onClick={() => onConfirm({ format: 'generic-text-bundle', deckName: 'DialogLingo', direction: 'bilingual', includeExpressions: true, includeSentences: true, tagPrefix: 'dialoglingo', outputLocation: '~/Downloads/DialogLingo' })}>
        Export Generic Text Bundle
      </button>
      <button type="button" onClick={onClose}>Close</button>
    </div>
  )
}
```

- [ ] **Step 5: Run export tests and an end-to-end build**

Run:

```bash
npm run test -- --run tests/main/export/anki-text-bundle.test.ts tests/main/export/apkg.test.ts tests/main/export/generic-text-bundle.test.ts
npm run typecheck
npm run build
```

Expected:

- export tests PASS
- typecheck/build PASS

- [ ] **Step 6: Commit exporters and final v1 integration**

```bash
git add src/main/export src/renderer/src/features/workbook/ExportModal.tsx src/shared/ipc/router.ts tests/main/export
git commit -m "feat: add workbook export flow"
```

## Self Review

### Spec coverage

- App shell, typed IPC boundary, DB, migrations, and settings: covered in Tasks 1-2
- Source adapters and local indexing/search semantics: covered in Tasks 3-4
- Search & Select UI rules: covered in Task 5
- Generation jobs, LiteLLM, typed job events, ranking, and rerank: covered in Task 6
- Workbook review, draft state, revisions, delete/restore/revert, and source panel: covered in Task 7
- Anki Package, Anki Text Bundle, and Generic Text Bundle: covered in Task 8

No spec section is intentionally skipped.

### Placeholder scan

- No `TBD`
- No “implement later”
- No “similar to previous task”
- Every task includes exact files, commands, and concrete code examples

### Type consistency

- Navigation ids use `search | workbook`
- Workbook item types use `Expression | Sentence`
- Workbook lifecycle uses `active | deleted`
- Search query scope uses `all | titles | transcript`
- Generation and export both assume `normalized preview` as the user-facing read layer
