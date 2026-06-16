export type QueryScope = 'all' | 'titles' | 'transcript'

export type SearchQueryPlan = {
  trimmed: string
  variants: string[]
  useLikeFallback: boolean
}

const SEPARATOR_PATTERN = /[\s\p{P}\p{S}]+/gu

function uniqueNonEmpty(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function quoteFtsPhrase(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

export function buildSearchQueryPlan(query: string): SearchQueryPlan {
  const trimmed = query.trim()
  const collapsedWhitespace = trimmed.replace(/\s+/g, ' ')
  const strippedSeparators = trimmed.replace(SEPARATOR_PATTERN, '')
  const variants = uniqueNonEmpty([trimmed, collapsedWhitespace, strippedSeparators])

  return {
    trimmed,
    variants,
    useLikeFallback: strippedSeparators.length > 0 && strippedSeparators.length < 3
  }
}

export function buildScopedFtsMatchQuery(scope: QueryScope, variants: string[]) {
  const expression = variants.map(quoteFtsPhrase).join(' OR ')

  if (scope === 'titles') {
    return `title : (${expression})`
  }

  if (scope === 'transcript') {
    return `normalized_text : (${expression})`
  }

  return expression
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

export function buildScopedLikeCondition(
  scope: QueryScope,
  variants: string[],
  tableAlias = 's'
) {
  const columns =
    scope === 'titles'
      ? ['title']
      : scope === 'transcript'
        ? ['search_text']
        : ['title', 'preview', 'search_text']
  const qualifiedColumns = columns.map((column) => `${tableAlias}.${column}`)
  const clauses: string[] = []
  const args: string[] = []

  for (const variant of variants) {
    const pattern = `%${escapeLike(variant)}%`
    for (const column of qualifiedColumns) {
      clauses.push(`${column} like ? escape '\\'`)
      args.push(pattern)
    }
  }

  return {
    sql: `(${clauses.join(' or ')})`,
    args
  }
}

export function buildHighlightedSnippet(
  value: string,
  variants: string[],
  contextChars = 90
) {
  const loweredValue = value.toLocaleLowerCase()
  const match = variants
    .map((variant) => ({
      variant,
      index: loweredValue.indexOf(variant.toLocaleLowerCase())
    }))
    .filter((candidate) => candidate.index >= 0)
    .sort((left, right) => {
      if (left.index !== right.index) {
        return left.index - right.index
      }
      return right.variant.length - left.variant.length
    })[0]

  if (!match) {
    return value.slice(0, contextChars * 2)
  }

  const start = Math.max(0, match.index - contextChars)
  const end = Math.min(value.length, match.index + match.variant.length + contextChars)
  const prefix = start > 0 ? '... ' : ''
  const suffix = end < value.length ? ' ...' : ''
  const before = value.slice(start, match.index)
  const highlighted = value.slice(match.index, match.index + match.variant.length)
  const after = value.slice(match.index + match.variant.length, end)

  return `${prefix}${before}<mark>${highlighted}</mark>${after}${suffix}`
}

function findNextVariantMatch(
  loweredValue: string,
  variants: string[],
  startIndex: number
) {
  return variants
    .map((variant) => ({
      variant,
      index: loweredValue.indexOf(variant.toLocaleLowerCase(), startIndex)
    }))
    .filter((candidate) => candidate.index >= 0)
    .sort((left, right) => {
      if (left.index !== right.index) {
        return left.index - right.index
      }
      return right.variant.length - left.variant.length
    })[0]
}

export function buildHighlightedText(value: string, variants: string[]) {
  const usableVariants = uniqueNonEmpty(variants)
  if (usableVariants.length === 0) {
    return value
  }

  const loweredValue = value.toLocaleLowerCase()
  let cursor = 0
  let highlighted = ''

  while (cursor < value.length) {
    const match = findNextVariantMatch(loweredValue, usableVariants, cursor)
    if (!match) {
      highlighted += value.slice(cursor)
      break
    }

    highlighted += value.slice(cursor, match.index)
    highlighted += `<mark>${value.slice(match.index, match.index + match.variant.length)}</mark>`
    cursor = match.index + match.variant.length
  }

  return highlighted
}
