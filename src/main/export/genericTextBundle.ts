import {
  createExportFileEntry,
  createExportManifest,
  escapeCsvField,
  escapeHtml,
  type ExportRowsInput,
  type ExportSourceRef,
  type ExpressionExportRow,
  type SentenceExportRow,
  type TextBundleOutput
} from './manifest'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type { ExpressionExportRow, SentenceExportRow } from './manifest'

export interface LegacyGenericTextBundleInput {
  workbookId: string
  deckName?: string
  direction?: ExportRowsInput['direction']
  tagPrefix?: string
  expressionRows: Array<{
    source?: string
    target?: string
    gloss?: string
    context?: string
    explanation?: string
    quiz?: string
    quizPrompt?: string
    quizAnswer?: string
    sourceRefs?: ExportSourceRef[]
    tags?: string[]
  }>
  sentenceRows: Array<{
    source?: string
    target?: string
    focus?: string
    context?: string
    explanation?: string
    quiz?: string
    quizPrompt?: string
    quizAnswer?: string
    sourceRefs?: ExportSourceRef[]
    tags?: string[]
  }>
}

export function buildGenericTextBundle(input: ExportRowsInput): TextBundleOutput {
  const payloadFiles = {
    'expression.csv': writeExpressionCsv(input.expressions),
    'sentence.csv': writeSentenceCsv(input.sentences),
    'expression.md': writeExpressionMarkdown(input.expressions),
    'sentence.md': writeSentenceMarkdown(input.sentences)
  }
  const manifest = createExportManifest({
    ...input,
    format: 'generic-text-bundle',
    files: Object.entries(payloadFiles).map(([filePath, contents]) =>
      createExportFileEntry(filePath, contents)
    )
  })

  return {
    manifest,
    files: {
      'manifest.json': JSON.stringify(manifest, null, 2),
      ...payloadFiles
    }
  }
}

export async function writeGenericTextBundle(
  outputDir: string,
  input: ExportRowsInput | LegacyGenericTextBundleInput
): Promise<TextBundleOutput> {
  const rowsInput = normalizeRowsInput(input)
  const output = buildGenericTextBundle(rowsInput)

  await writeBundleFiles(outputDir, output.files)
  return output
}

function writeExpressionCsv(rows: ExpressionExportRow[]): string {
  return writeCsv(
    [
      'id',
      'type',
      'expression',
      'translation',
      'gloss',
      'context',
      'explanation',
      'quizPrompt',
      'quizAnswer',
      'sourceRefs',
      'tags',
      'isFlagged'
    ],
    rows.map((row) => [
      row.id,
      row.itemType,
      row.expression,
      row.translation,
      row.gloss ?? '',
      row.context ?? '',
      row.explanation ?? '',
      row.quizPrompt ?? '',
      row.quizAnswer ?? '',
      formatSourceRefs(row.sourceRefs),
      (row.tags ?? []).join(' '),
      row.isFlagged === true ? 'true' : 'false'
    ])
  )
}

function writeSentenceCsv(rows: SentenceExportRow[]): string {
  return writeCsv(
    [
      'id',
      'type',
      'sentence',
      'translation',
      'focus',
      'context',
      'explanation',
      'quizPrompt',
      'quizAnswer',
      'sourceRefs',
      'tags',
      'isFlagged'
    ],
    rows.map((row) => [
      row.id,
      row.itemType,
      row.sentence,
      row.translation,
      row.focus ?? '',
      row.context ?? '',
      row.note ?? '',
      row.quizPrompt ?? '',
      row.quizAnswer ?? '',
      formatSourceRefs(row.sourceRefs),
      (row.tags ?? []).join(' '),
      row.isFlagged === true ? 'true' : 'false'
    ])
  )
}

function writeCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows]
    .map((row) => row.map(escapeCsvField).join(','))
    .join('\n')
}

function formatSourceRefs(sourceRefs: ExportSourceRef[] = []): string {
  return JSON.stringify(sourceRefs)
}

function writeExpressionMarkdown(rows: ExpressionExportRow[]): string {
  if (rows.length === 0) {
    return '# Expressions\n\nNo expression items were exported.'
  }

  return [
    '# Expressions',
    '',
    ...rows.map((row) =>
      [
        `## ${escapeHtml(row.expression)}`,
        '',
        `- Translation: ${escapeHtml(row.translation)}`,
        `- Gloss: ${escapeHtml(row.gloss ?? '')}`,
        `- Context: ${escapeHtml(row.context ?? '')}`,
        `- Explanation: ${escapeHtml(row.explanation ?? '')}`,
        `- Quiz: ${escapeHtml(formatQuiz(row.quizPrompt, row.quizAnswer))}`,
        `- Tags: ${escapeHtml((row.tags ?? []).join(' '))}`,
        `- Source refs: ${escapeHtml(formatSourceSummary(row.sourceRefs))}`
      ].join('\n')
    )
  ].join('\n')
}

function writeSentenceMarkdown(rows: SentenceExportRow[]): string {
  if (rows.length === 0) {
    return '# Sentences\n\nNo sentence items were exported.'
  }

  return [
    '# Sentences',
    '',
    ...rows.map((row) =>
      [
        `## ${escapeHtml(row.sentence)}`,
        '',
        `- Translation: ${escapeHtml(row.translation)}`,
        `- Focus: ${escapeHtml(row.focus ?? '')}`,
        `- Context: ${escapeHtml(row.context ?? '')}`,
        `- Explanation: ${escapeHtml(row.note ?? '')}`,
        `- Quiz: ${escapeHtml(formatQuiz(row.quizPrompt, row.quizAnswer))}`,
        `- Tags: ${escapeHtml((row.tags ?? []).join(' '))}`,
        `- Source refs: ${escapeHtml(formatSourceSummary(row.sourceRefs))}`
      ].join('\n')
    )
  ].join('\n')
}

function formatQuiz(prompt?: string, answer?: string): string {
  return [
    prompt?.trim() ? `Prompt: ${prompt.trim()}` : undefined,
    answer?.trim() ? `Answer: ${answer.trim()}` : undefined
  ].filter((section): section is string => Boolean(section)).join(' ')
}

function formatSourceSummary(sourceRefs: ExportSourceRef[] = []): string {
  if (sourceRefs.length === 0) {
    return 'none'
  }

  return sourceRefs
    .map((ref) =>
      [
        ref.sourceType ?? 'unknown',
        ref.sessionId,
        ref.sourceSpanRef
      ].filter(Boolean).join(':')
    )
    .join(', ')
}

function normalizeRowsInput(
  input: ExportRowsInput | LegacyGenericTextBundleInput
): ExportRowsInput {
  if ('expressions' in input) {
    return input
  }

  return normalizeLegacyRows(input)
}

function normalizeLegacyRows(input: LegacyGenericTextBundleInput): ExportRowsInput {
  return {
    workbookId: input.workbookId,
    deckName: input.deckName ?? input.workbookId,
    direction: input.direction ?? 'bilingual',
    tagPrefix: input.tagPrefix ?? 'dialoglingo',
    expressions: input.expressionRows.map((row, index) => ({
      id: `expression-${index + 1}`,
      itemType: 'Expression',
      state: 'active',
      expression: row.source ?? '',
      translation: row.target ?? '',
      gloss: row.gloss,
      context: row.context,
      explanation: row.explanation,
      quizPrompt: row.quizPrompt ?? row.quiz,
      quizAnswer: row.quizAnswer,
      sourceRefs: row.sourceRefs,
      tags: row.tags
    })),
    sentences: input.sentenceRows.map((row, index) => ({
      id: `sentence-${index + 1}`,
      itemType: 'Sentence',
      state: 'active',
      sentence: row.source ?? '',
      translation: row.target ?? '',
      focus: row.focus,
      context: row.context,
      note: row.explanation,
      quizPrompt: row.quizPrompt ?? row.quiz,
      quizAnswer: row.quizAnswer,
      sourceRefs: row.sourceRefs,
      tags: row.tags
    }))
  }
}

async function writeBundleFiles(outputDir: string, files: Record<string, string>): Promise<void> {
  await mkdir(outputDir, { recursive: true })
  await Promise.all(
    Object.entries(files).map(([filename, contents]) =>
      writeFile(join(outputDir, filename), contents, 'utf8')
    )
  )
}
