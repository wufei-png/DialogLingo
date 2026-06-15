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

export const candidateGroupsTable = sqliteTable('candidate_groups', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull(),
  sessionId: text('session_id').notNull(),
  sourceSpanRef: text('source_span_ref').notNull(),
  promptText: text('prompt_text').notNull(),
  status: text('status').notNull()
})

export const enrichmentBatchesTable = sqliteTable('enrichment_batches', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull(),
  batchIndex: integer('batch_index').notNull(),
  status: text('status').notNull(),
  requestJson: text('request_json').notNull(),
  responseJson: text('response_json').notNull()
})

export const rankedOrdersTable = sqliteTable('ranked_orders', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull(),
  rankProfileJson: text('rank_profile_json').notNull(),
  orderedIdsJson: text('ordered_ids_json').notNull()
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
