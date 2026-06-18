import {
  createExportManifest,
  type ExportManifest,
  type ExportRowsInput,
  type ExpressionExportRow,
  type SentenceExportRow
} from './manifest'
import { expressionToAnkiCard, sentenceToAnkiCard } from './ankiTextBundle'

export type { ExpressionExportRow, SentenceExportRow } from './manifest'

export interface AnkiDeckWriter {
  addCard(front: string, back: string, options?: { tags?: string[] }): void
  save(options?: unknown): Promise<Buffer>
}

export interface AnkiPackageOutput {
  data: Buffer
  manifest: ExportManifest
}

export interface AnkiPackageDependencies {
  createDeck?: (deckName: string) => AnkiDeckWriter | Promise<AnkiDeckWriter>
}

export interface LegacyApkgInput {
  workbookId?: string
  deckName: string
  direction?: ExportRowsInput['direction']
  tagPrefix?: string
  expressionRows: Array<{
    front: string
    back: string
    gloss?: string
    context?: string
    explanation?: string
    quiz?: string
    tags?: string[]
  }>
  sentenceRows: Array<{
    front: string
    back: string
    context?: string
    explanation?: string
    tags?: string[]
  }>
}

export async function buildAnkiPackage(
  input: ExportRowsInput,
  dependencies: AnkiPackageDependencies = {}
): Promise<AnkiPackageOutput> {
  const deck = await (dependencies.createDeck ?? createDefaultDeck)(input.deckName)

  for (const row of input.expressions) {
    const card = expressionToAnkiCard(row, input)
    deck.addCard(card.front, card.back, { tags: card.tags })
  }

  for (const row of input.sentences) {
    const card = sentenceToAnkiCard(row, input)
    deck.addCard(card.front, card.back, { tags: card.tags })
  }

  const data = await deck.save()
  const manifest = createExportManifest({
    ...input,
    format: 'anki-package',
    files: []
  })

  return {
    data,
    manifest
  }
}

export async function writeApkg(
  input: LegacyApkgInput,
  dependencies: AnkiPackageDependencies = {}
): Promise<Buffer> {
  const output = await buildAnkiPackage(normalizeLegacyRows(input), dependencies)
  return output.data
}

async function createDefaultDeck(deckName: string): Promise<AnkiDeckWriter> {
  // The APKG package is CJS-shaped and confused by Vite's static import rewrite;
  // dynamic loading keeps Electron packaging from bundling the wrong wrapper.
  const module = (await import(
    /* @vite-ignore */ ankiApkgExporterSpecifier
  )) as {
    default?: (deckName: string) => AnkiDeckWriter
  }
  const factory = module.default

  if (typeof factory !== 'function') {
    throw new Error('Unable to load Anki APKG exporter.')
  }

  return factory(deckName)
}

const ankiApkgExporterSpecifier = '@paperclipsapp/anki-apkg-export'

function normalizeLegacyRows(input: LegacyApkgInput): ExportRowsInput {
  return {
    workbookId: input.workbookId ?? input.deckName,
    deckName: input.deckName,
    direction: input.direction ?? 'bilingual',
    tagPrefix: input.tagPrefix ?? 'dialoglingo',
    expressions: input.expressionRows.map((row, index) => ({
      id: `expression-${index + 1}`,
      itemType: 'Expression',
      state: 'active',
      expression: row.front,
      translation: row.back,
      gloss: row.gloss,
      context: row.context,
      explanation: row.explanation ?? row.gloss,
      quizPrompt: row.quiz,
      tags: row.tags
    })),
    sentences: input.sentenceRows.map((row, index) => ({
      id: `sentence-${index + 1}`,
      itemType: 'Sentence',
      state: 'active',
      sentence: row.front,
      translation: row.back,
      context: row.context,
      note: row.explanation ?? row.context,
      tags: row.tags
    }))
  }
}
