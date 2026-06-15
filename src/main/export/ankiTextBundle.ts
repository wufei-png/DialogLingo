import {
  buildAnkiTags,
  createExportManifest,
  escapeTsvField,
  joinHtmlSections,
  type ExportDirection,
  type ExportRowsInput,
  type ExpressionExportRow,
  type SentenceExportRow,
  type TextBundleOutput
} from './manifest'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type { ExpressionExportRow, SentenceExportRow } from './manifest'

export interface AnkiCard {
  front: string
  back: string
  tags: string[]
}

export interface LegacyAnkiTextBundleInput {
  workbookId: string
  deckName?: string
  direction?: ExportDirection
  tagPrefix?: string
  expressionRows: Array<{
    source?: string
    target?: string
    front?: string
    back?: string
    gloss?: string
    context?: string
    explanation?: string
    tags?: string[]
  }>
  sentenceRows: Array<{
    source?: string
    target?: string
    front?: string
    back?: string
    context?: string
    explanation?: string
    tags?: string[]
  }>
}

export function buildAnkiTextBundle(input: ExportRowsInput): TextBundleOutput {
  const files = ['expressions.tsv', 'sentences.tsv']
  const manifest = createExportManifest({
    ...input,
    format: 'anki-text-bundle',
    files
  })

  return {
    manifest,
    files: {
      'manifest.json': JSON.stringify(manifest, null, 2),
      'expressions.tsv': writeTsv(
        ['front', 'back', 'tags'],
        input.expressions.map((row) => expressionToAnkiCard(row, input))
      ),
      'sentences.tsv': writeTsv(
        ['front', 'back', 'tags'],
        input.sentences.map((row) => sentenceToAnkiCard(row, input))
      )
    }
  }
}

export async function writeAnkiTextBundle(
  outputDir: string,
  input: LegacyAnkiTextBundleInput
): Promise<TextBundleOutput> {
  const rowsInput = normalizeLegacyRows(input)
  const files = ['expression.tsv', 'sentence.tsv']
  const manifest = createExportManifest({
    ...rowsInput,
    format: 'anki-text-bundle',
    files
  })
  const output: TextBundleOutput = {
    manifest,
    files: {
      'manifest.json': JSON.stringify(manifest, null, 2),
      'expression.tsv': writeTsv(
        ['front', 'back', 'tags'],
        rowsInput.expressions.map((row) => expressionToAnkiCard(row, rowsInput))
      ),
      'sentence.tsv': writeTsv(
        ['front', 'back', 'tags'],
        rowsInput.sentences.map((row) => sentenceToAnkiCard(row, rowsInput))
      )
    }
  }

  await writeBundleFiles(outputDir, output.files)
  return output
}

export function expressionToAnkiCard(
  row: ExpressionExportRow,
  input: Pick<ExportRowsInput, 'direction' | 'tagPrefix'>
): AnkiCard {
  const front = frontForDirection(input.direction, row.expression, row.translation)
  const back = joinHtmlSections([
    backForDirection(input.direction, row.expression, row.translation),
    row.explanation,
    row.example ? `Example: ${row.example}` : undefined,
    row.source ? `Source: ${row.source}` : undefined
  ])

  return {
    front,
    back,
    tags: buildAnkiTags(input.tagPrefix, 'Expression', row.tags)
  }
}

export function sentenceToAnkiCard(
  row: SentenceExportRow,
  input: Pick<ExportRowsInput, 'direction' | 'tagPrefix'>
): AnkiCard {
  const front = frontForDirection(input.direction, row.sentence, row.translation)
  const back = joinHtmlSections([
    backForDirection(input.direction, row.sentence, row.translation),
    row.note,
    row.source ? `Source: ${row.source}` : undefined
  ])

  return {
    front,
    back,
    tags: buildAnkiTags(input.tagPrefix, 'Sentence', row.tags)
  }
}

function writeTsv(headers: string[], cards: AnkiCard[]): string {
  const rows = [
    headers,
    ...cards.map((card) => [
      escapeTsvField(card.front),
      escapeTsvField(card.back),
      escapeTsvField(card.tags.join(' '))
    ])
  ]

  return rows.map((row) => row.join('\t')).join('\n')
}

function frontForDirection(direction: ExportDirection, english: string, translation: string): string {
  return direction === 'zh-en' ? translation : english
}

function backForDirection(direction: ExportDirection, english: string, translation: string): string {
  if (direction === 'zh-en') {
    return english
  }

  return translation
}

function normalizeLegacyRows(input: LegacyAnkiTextBundleInput): ExportRowsInput {
  return {
    deckName: input.deckName ?? input.workbookId,
    direction: input.direction ?? 'bilingual',
    tagPrefix: input.tagPrefix ?? 'dialoglingo',
    expressions: input.expressionRows.map((row, index) => ({
      id: `expression-${index + 1}`,
      itemType: 'Expression',
      state: 'active',
      expression: row.front ?? row.source ?? '',
      translation: row.back ?? row.target ?? '',
      explanation: row.explanation ?? row.gloss,
      example: row.context,
      tags: row.tags
    })),
    sentences: input.sentenceRows.map((row, index) => ({
      id: `sentence-${index + 1}`,
      itemType: 'Sentence',
      state: 'active',
      sentence: row.front ?? row.source ?? row.context ?? '',
      translation: row.back ?? row.target ?? '',
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
