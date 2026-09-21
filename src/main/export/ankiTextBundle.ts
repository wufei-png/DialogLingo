import {
  buildAnkiTags,
  createExportFileEntry,
  createExportManifest,
  escapeTsvField,
  htmlLineBreaks,
  joinHtmlSections,
  type ExportDirection,
  type ExportRowsInput,
  type ExportSourceRef,
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
    quiz?: string
    quizPrompt?: string
    quizAnswer?: string
    sourceRefs?: ExportSourceRef[]
    tags?: string[]
  }>
  sentenceRows: Array<{
    source?: string
    target?: string
    front?: string
    back?: string
    context?: string
    explanation?: string
    focus?: string
    quiz?: string
    quizPrompt?: string
    quizAnswer?: string
    sourceRefs?: ExportSourceRef[]
    tags?: string[]
  }>
}

export function buildAnkiTextBundle(input: ExportRowsInput): TextBundleOutput {
  const generatedAt = input.generatedAt ?? new Date().toISOString()
  const payloadFiles = {
    'expression.tsv': writeTsvRows(
      ['Front', 'Back', 'Gloss', 'Context', 'Explanation', 'Quiz', 'Tags'],
      input.expressions.map((row) => expressionToAnkiFields(row, input))
    ),
    'sentence.tsv': writeTsvRows(
      ['Front', 'Back', 'Focus', 'Explanation', 'Quiz', 'Tags'],
      input.sentences.map((row) => sentenceToAnkiFields(row, input))
    ),
    'README-import.md': buildAnkiTextBundleReadme(input, generatedAt)
  }
  const manifest = createExportManifest({
    ...input,
    format: 'anki-text-bundle',
    generatedAt,
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

export async function writeAnkiTextBundle(
  outputDir: string,
  input: ExportRowsInput | LegacyAnkiTextBundleInput
): Promise<TextBundleOutput> {
  const rowsInput = normalizeRowsInput(input)
  const output = buildAnkiTextBundle(rowsInput)

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
    row.gloss,
    row.context ? `Context: ${row.context}` : undefined,
    row.explanation,
    formatQuiz(row.quizPrompt, row.quizAnswer)
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
    row.focus,
    row.context ? `Context: ${row.context}` : undefined,
    row.note,
    formatQuiz(row.quizPrompt, row.quizAnswer)
  ])

  return {
    front,
    back,
    tags: buildAnkiTags(input.tagPrefix, 'Sentence', row.tags)
  }
}

function expressionToAnkiFields(
  row: ExpressionExportRow,
  input: Pick<ExportRowsInput, 'direction' | 'tagPrefix'>
): string[] {
  return [
    ankiField(frontForDirection(input.direction, row.expression, row.translation)),
    ankiField(backForDirection(input.direction, row.expression, row.translation)),
    ankiField(row.gloss ?? ''),
    ankiField(row.context ?? ''),
    ankiField(row.explanation ?? ''),
    ankiField(formatQuiz(row.quizPrompt, row.quizAnswer)),
    buildAnkiTags(input.tagPrefix, 'Expression', row.tags).join(' ')
  ]
}

function sentenceToAnkiFields(
  row: SentenceExportRow,
  input: Pick<ExportRowsInput, 'direction' | 'tagPrefix'>
): string[] {
  return [
    ankiField(frontForDirection(input.direction, row.sentence, row.translation)),
    ankiField(backForDirection(input.direction, row.sentence, row.translation)),
    ankiField(row.focus ?? ''),
    ankiField(row.note ?? ''),
    ankiField(formatQuiz(row.quizPrompt, row.quizAnswer)),
    buildAnkiTags(input.tagPrefix, 'Sentence', row.tags).join(' ')
  ]
}

function writeTsvRows(headers: string[], bodyRows: string[][]): string {
  const headerRows = [
    '#separator:Tab',
    '#html:true',
    `#columns:${headers.join('\t')}`,
    `#tags column:${headers.length}`
  ]
  const dataRows = bodyRows.map((row) => row.map(escapeTsvField).join('\t'))

  return [...headerRows, ...dataRows].join('\n')
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

function ankiField(value: string): string {
  return htmlLineBreaks(value)
}

function formatQuiz(prompt?: string, answer?: string): string {
  const sections = [
    prompt?.trim() ? `Prompt: ${prompt.trim()}` : undefined,
    answer?.trim() ? `Answer: ${answer.trim()}` : undefined
  ].filter((section): section is string => Boolean(section))

  return sections.join('\n')
}

function normalizeRowsInput(
  input: ExportRowsInput | LegacyAnkiTextBundleInput
): ExportRowsInput {
  if ('expressions' in input) {
    return input
  }

  return normalizeLegacyRows(input)
}

function normalizeLegacyRows(input: LegacyAnkiTextBundleInput): ExportRowsInput {
  return {
    workbookId: input.workbookId,
    deckName: input.deckName ?? input.workbookId,
    direction: input.direction ?? 'bilingual',
    tagPrefix: input.tagPrefix ?? 'dialoglingo',
    expressions: input.expressionRows.map((row, index) => ({
      id: `expression-${index + 1}`,
      itemType: 'Expression',
      state: 'active',
      expression: row.front ?? row.source ?? '',
      translation: row.back ?? row.target ?? '',
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
      sentence: row.front ?? row.source ?? row.context ?? '',
      translation: row.back ?? row.target ?? '',
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

function buildAnkiTextBundleReadme(input: ExportRowsInput, generatedAt: string): string {
  return [
    '# DialogLingo Anki Text Bundle',
    '',
    `Workbook: ${input.workbookId}`,
    `Deck: ${input.deckName}`,
    `Generated at: ${generatedAt}`,
    '',
    'Import expression.tsv with a DialogLingo::Expression note type containing Front, Back, Gloss, Context, Explanation, and Quiz fields.',
    'Import sentence.tsv with a DialogLingo::Sentence note type containing Front, Back, Focus, Explanation, and Quiz fields.',
    'The final Tags column is mapped to Anki note tags. Keep Allow HTML enabled so <br> line breaks and formatted fields render correctly.',
    'The file headers preset the tab separator, HTML mode, named columns, and tags column. The headers are comments, so older Anki versions can still detect the first data row without importing a column-title pseudo-note.',
    '',
    'Only active workbook items selected by type are included. Deleted items are not exported. Flagged items follow the export policy configured in DialogLingo.',
    '',
    'Source provenance is summarized in manifest.json. The TSV files intentionally contain only Anki note fields.'
  ].join('\n')
}

async function writeBundleFiles(outputDir: string, files: Record<string, string>): Promise<void> {
  await mkdir(outputDir, { recursive: true })
  await Promise.all(
    Object.entries(files).map(([filename, contents]) =>
      writeFile(join(outputDir, filename), contents, 'utf8')
    )
  )
}
