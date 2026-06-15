import {
  createExportManifest,
  escapeCsvField,
  escapeHtml,
  type ExportRowsInput,
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
    explanation?: string
    tags?: string[]
  }>
  sentenceRows: Array<{
    source?: string
    target?: string
    explanation?: string
    tags?: string[]
  }>
}

export function buildGenericTextBundle(input: ExportRowsInput): TextBundleOutput {
  const files = ['expressions.csv', 'sentences.csv', 'items.jsonl']
  const manifest = createExportManifest({
    ...input,
    format: 'generic-text-bundle',
    files
  })

  return {
    manifest,
    files: {
      'manifest.json': JSON.stringify(manifest, null, 2),
      'expressions.csv': writeExpressionCsv(input.expressions),
      'sentences.csv': writeSentenceCsv(input.sentences),
      'items.jsonl': writeJsonl([...input.expressions, ...input.sentences])
    }
  }
}

export async function writeGenericTextBundle(
  outputDir: string,
  input: LegacyGenericTextBundleInput
): Promise<TextBundleOutput> {
  const rowsInput = normalizeLegacyRows(input)
  const files = ['expression.csv', 'sentence.csv', 'sentence.md']
  const manifest = createExportManifest({
    ...rowsInput,
    format: 'generic-text-bundle',
    files
  })
  const output: TextBundleOutput = {
    manifest,
    files: {
      'manifest.json': JSON.stringify(manifest, null, 2),
      'expression.csv': writeExpressionCsv(rowsInput.expressions),
      'sentence.csv': writeSentenceCsv(rowsInput.sentences),
      'sentence.md': writeSentenceMarkdown(rowsInput.sentences)
    }
  }

  await writeBundleFiles(outputDir, output.files)
  return output
}

function writeExpressionCsv(rows: ExpressionExportRow[]): string {
  return writeCsv(
    ['id', 'type', 'expression', 'translation', 'explanation', 'example', 'source', 'tags', 'isFlagged'],
    rows.map((row) => [
      row.id,
      row.itemType,
      row.expression,
      row.translation,
      row.explanation ?? '',
      row.example ?? '',
      row.source ?? '',
      (row.tags ?? []).join(' '),
      row.isFlagged === true ? 'true' : 'false'
    ])
  )
}

function writeSentenceCsv(rows: SentenceExportRow[]): string {
  return writeCsv(
    ['id', 'type', 'sentence', 'translation', 'note', 'source', 'tags', 'isFlagged'],
    rows.map((row) => [
      row.id,
      row.itemType,
      row.sentence,
      row.translation,
      row.note ?? '',
      row.source ?? '',
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

function writeJsonl(rows: Array<ExpressionExportRow | SentenceExportRow>): string {
  return rows.map((row) => JSON.stringify(row)).join('\n')
}

function writeSentenceMarkdown(rows: SentenceExportRow[]): string {
  return rows
    .map((row) => `## ${escapeHtml(row.sentence)}\n\n${escapeHtml(row.translation)}`)
    .join('\n\n')
}

function normalizeLegacyRows(input: LegacyGenericTextBundleInput): ExportRowsInput {
  return {
    deckName: input.deckName ?? input.workbookId,
    direction: input.direction ?? 'bilingual',
    tagPrefix: input.tagPrefix ?? 'dialoglingo',
    expressions: input.expressionRows.map((row, index) => ({
      id: `expression-${index + 1}`,
      itemType: 'Expression',
      state: 'active',
      expression: row.source ?? '',
      translation: row.target ?? '',
      explanation: row.explanation,
      tags: row.tags
    })),
    sentences: input.sentenceRows.map((row, index) => ({
      id: `sentence-${index + 1}`,
      itemType: 'Sentence',
      state: 'active',
      sentence: row.source ?? '',
      translation: row.target ?? '',
      note: row.explanation,
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
