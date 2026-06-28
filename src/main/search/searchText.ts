import {
  isTurnToolNoise,
  normalizeNaturalText
} from '../text/turnNoise'

type SearchIndexTurn = {
  text: string
  isToolNoise?: boolean
}

function searchableTurns<T extends SearchIndexTurn>(turns: T[]) {
  return turns.filter((turn) => !isTurnToolNoise(turn))
}

function normalizePreviewText(text: string) {
  return normalizeNaturalText(text.replace(/\s+/g, ' '))
}

function truncatePreview(text: string, maxLength: number) {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`
}

export function buildSearchText<T extends SearchIndexTurn>(turns: T[]) {
  return searchableTurns(turns)
    .map((turn) => turn.text.trim())
    .filter(Boolean)
    .join('\n')
}

export function buildSearchPreview<T extends SearchIndexTurn>(
  turns: T[],
  fallback: string,
  maxLength = 160
) {
  const source =
    searchableTurns(turns)
      .map((turn) => normalizePreviewText(turn.text))
      .find(Boolean) ??
    (isTurnToolNoise({ text: fallback }) ? '' : normalizePreviewText(fallback))

  return truncatePreview(source, maxLength)
}
