export const EXPORT_FORMATS = [
  'anki-package',
  'anki-text-bundle',
  'generic-text-bundle'
] as const

export type ExportFormat = (typeof EXPORT_FORMATS)[number]
export type ExportDirection = 'en-zh' | 'zh-en' | 'bilingual'
export type StudyItemType = 'Expression' | 'Sentence'
export type WorkbookItemState = 'active' | 'deleted'
export type FlaggedItemExportPolicy = 'block' | 'warn'

export interface ExportSourceRef {
  sessionId: string
  sourceSpanRef: string
  excerpt: string
  sourceType?: string | null
}

export interface ExportPolicyItem {
  id: string
  itemType?: StudyItemType
  state: WorkbookItemState
  flagged?: boolean
  isFlagged?: boolean
}

export interface ExpressionExportRow extends ExportPolicyItem {
  itemType: 'Expression'
  expression: string
  translation: string
  gloss?: string
  context?: string
  explanation?: string
  quizPrompt?: string
  quizAnswer?: string
  source?: string
  sourceRefs?: ExportSourceRef[]
  tags?: string[]
}

export interface SentenceExportRow extends ExportPolicyItem {
  itemType: 'Sentence'
  sentence: string
  translation: string
  focus?: string
  context?: string
  note?: string
  quizPrompt?: string
  quizAnswer?: string
  source?: string
  sourceRefs?: ExportSourceRef[]
  tags?: string[]
}

export interface ExportItemCounts {
  expressions: number
  sentences: number
  total: number
}

export interface ExportRowsInput {
  workbookId: string
  deckName: string
  direction: ExportDirection
  tagPrefix: string
  generatedAt?: string
  includedItemTypes?: StudyItemType[]
  selectedItemCounts?: ExportItemCounts
  sourcePlatformSummary?: Record<string, number>
  expressions: ExpressionExportRow[]
  sentences: SentenceExportRow[]
}

export interface ExportSelectionPolicy {
  includeExpressions?: boolean
  includeSentences?: boolean
  keepFlaggedItems?: boolean
  flaggedItemExportPolicy?: FlaggedItemExportPolicy
}

export type ExportPolicyResult<T extends ExportPolicyItem> = T[] & {
  items: T[]
  excluded: {
    inactive: string[]
    type: string[]
    flagged: string[]
  }
  warnings: string[]
}

export interface ExportManifest {
  schemaVersion: 1
  appName: 'DialogLingo'
  workbookId: string
  format: ExportFormat
  deckName: string
  direction: ExportDirection
  generatedAt: string
  includedItemTypes: StudyItemType[]
  selectedItemCounts: ExportItemCounts
  exportedItemCounts: ExportItemCounts
  itemCounts: ExportItemCounts
  sourcePlatformSummary: Record<string, number>
  files: string[]
}

export interface TextBundleOutput {
  manifest: ExportManifest
  files: Record<string, string>
}

export function filterExportableItems<T extends ExportPolicyItem>(
  items: T[],
  policy: ExportSelectionPolicy
): ExportPolicyResult<T> {
  const normalizedPolicy = {
    includeExpressions: policy.includeExpressions ?? true,
    includeSentences: policy.includeSentences ?? true,
    keepFlaggedItems: policy.keepFlaggedItems ?? false,
    flaggedItemExportPolicy: policy.flaggedItemExportPolicy ?? 'warn'
  }
  const result = [] as unknown as ExportPolicyResult<T>
  result.excluded = {
    inactive: [],
    type: [],
    flagged: []
  }
  result.warnings = []

  for (const item of items) {
    if (item.state !== 'active') {
      result.excluded.inactive.push(item.id)
      continue
    }

    if (!isIncludedType(item, normalizedPolicy)) {
      result.excluded.type.push(item.id)
      continue
    }

    if (isFlagged(item)) {
      if (normalizedPolicy.flaggedItemExportPolicy === 'block' || !normalizedPolicy.keepFlaggedItems) {
        result.excluded.flagged.push(item.id)
        continue
      }
    }

    result.push(item)
  }

  if (result.excluded.flagged.length > 0) {
    const count = result.excluded.flagged.length
    const noun = pluralize(count, 'item')
    if (normalizedPolicy.flaggedItemExportPolicy === 'block') {
      result.warnings.push(`${count} flagged ${noun} was blocked by export policy.`)
    } else {
      result.warnings.push(`${count} flagged ${noun} was excluded from the export.`)
    }
  }

  const includedFlaggedCount = result.filter(isFlagged).length
  if (includedFlaggedCount > 0) {
    result.warnings.push(
      `${includedFlaggedCount} flagged ${pluralize(includedFlaggedCount, 'item')} is included in the export.`
    )
  }

  // Keep array compatibility for existing callers while exposing a named
  // property for code that wants an explicit result shape.
  Object.defineProperty(result, 'items', {
    value: Array.from(result),
    enumerable: false
  })

  return result
}

export function createExportManifest(
  input: ExportRowsInput & {
    format: ExportFormat
    files: string[]
  }
): ExportManifest {
  const exportedItemCounts = countExportRows(input.expressions, input.sentences)

  return {
    schemaVersion: 1,
    appName: 'DialogLingo',
    workbookId: input.workbookId,
    format: input.format,
    deckName: input.deckName,
    direction: input.direction,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    includedItemTypes: input.includedItemTypes ?? inferIncludedItemTypes(input),
    selectedItemCounts: input.selectedItemCounts ?? exportedItemCounts,
    exportedItemCounts,
    itemCounts: exportedItemCounts,
    sourcePlatformSummary:
      input.sourcePlatformSummary ??
      countSourcePlatforms([...input.expressions, ...input.sentences]),
    files: input.files
  }
}

export function countExportRows(
  expressions: ExpressionExportRow[],
  sentences: SentenceExportRow[]
): ExportItemCounts {
  return {
    expressions: expressions.length,
    sentences: sentences.length,
    total: expressions.length + sentences.length
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function htmlLineBreaks(value: string): string {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, '<br>')
}

export function joinHtmlSections(sections: Array<string | undefined>): string {
  return sections
    .map((section) => section?.trim())
    .filter((section): section is string => Boolean(section))
    .map(htmlLineBreaks)
    .join('<br><br>')
}

export function escapeTsvField(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
}

export function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function sanitizeAnkiTag(tag: string): string {
  return tag.trim().replace(/\s+/g, '_')
}

export function buildAnkiTags(
  tagPrefix: string,
  itemType: StudyItemType,
  rowTags: string[] = []
): string[] {
  const prefix = tagPrefix.trim()
  const typeTag = prefix ? `${prefix}::${itemType.toLowerCase()}` : itemType.toLowerCase()

  return uniqueTags([typeTag, ...rowTags].map(sanitizeAnkiTag))
}

function isIncludedType(
  item: ExportPolicyItem,
  policy: Required<ExportSelectionPolicy>
): boolean {
  if (item.itemType === undefined) {
    return true
  }

  return (
    (item.itemType === 'Expression' && policy.includeExpressions) ||
    (item.itemType === 'Sentence' && policy.includeSentences)
  )
}

function isFlagged(item: ExportPolicyItem): boolean {
  return item.isFlagged === true || item.flagged === true
}

function pluralize(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`
}

function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const tag of tags) {
    if (!tag || seen.has(tag)) {
      continue
    }

    seen.add(tag)
    result.push(tag)
  }

  return result
}

function inferIncludedItemTypes(input: Pick<ExportRowsInput, 'expressions' | 'sentences'>) {
  const types: StudyItemType[] = []
  if (input.expressions.length > 0) {
    types.push('Expression')
  }
  if (input.sentences.length > 0) {
    types.push('Sentence')
  }
  return types
}

function countSourcePlatforms(
  rows: Array<ExpressionExportRow | SentenceExportRow>
): Record<string, number> {
  const counts: Record<string, number> = {}

  for (const row of rows) {
    for (const ref of row.sourceRefs ?? []) {
      const sourceType = ref.sourceType?.trim() || 'unknown'
      counts[sourceType] = (counts[sourceType] ?? 0) + 1
    }
  }

  return counts
}
