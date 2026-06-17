import {
  cleanNaturalLanguageText,
  hasNaturalLanguageSignal,
  isLikelyPureNoiseText
} from '../text/turnNoise'

export type CandidateGroup = {
  id: string
  sourceSpanRef: string
  promptText: string
  role?: 'user' | 'assistant'
  status: 'pending'
}

type CandidateTurn = {
  text: string
  sourceSpanRef?: string
  role?: 'user' | 'assistant'
}

type CandidateRow = CandidateGroup & {
  score: number
  originIndex: number
}

const MIN_CANDIDATE_LENGTH = 12
const MIN_CJK_CANDIDATE_LENGTH = 6
const MAX_CANDIDATE_LENGTH = 700
const CHUNK_TARGET_LENGTH = 360

const URL_ONLY_PATTERN = /^(https?:\/\/|file:\/\/)\S+$/i
const HASH_ONLY_PATTERN = /^[a-f0-9]{32,}$/i
const PATHISH_PATTERN =
  /^((~|\.)?\/|[A-Za-z]:\\)[^\s]+(?::\d+(?::\d+)?)?$/
const SHELL_FRAGMENT_PATTERN =
  /^([$>%]\s+)?(npm|pnpm|yarn|node|python3?|git|gh|glab|docker|kubectl|curl|sed|rg|grep|cat|ls|cd|mkdir|rm|cp|mv|tsx)\b(?:\s+[-\w./:=@,]+){0,12}$/i

function splitSentences(text: string) {
  return (
    text
      .match(/[^.!?。！？]+[.!?。！？]?/g)
      ?.map((sentence) => sentence.trim())
      .filter(Boolean) ?? []
  )
}

function splitCandidateText(text: string) {
  return text
    .split(/\n{2,}/)
    .flatMap((paragraph) => {
      const normalized = paragraph.replace(/\s*\n\s*/g, ' ').trim()
      if (!normalized) {
        return []
      }

      if (normalized.length <= CHUNK_TARGET_LENGTH) {
        return [normalized]
      }

      const sentences = splitSentences(normalized)
      if (sentences.length <= 1) {
        return [normalized]
      }

      const chunks: string[] = []
      let current = ''
      for (const sentence of sentences) {
        const next = current ? `${current} ${sentence}` : sentence
        if (next.length > CHUNK_TARGET_LENGTH && current) {
          chunks.push(current)
          current = sentence
        } else {
          current = next
        }
      }

      if (current) {
        chunks.push(current)
      }

      return chunks
    })
    .map((candidate) => candidate.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function normalizeCandidateFingerprint(text: string) {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\b(?:the|a|an)\b/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/((~|\.)?\/|[a-z]:\\)\S+/gi, ' ')
    .replace(/[^\p{L}\p{N}\u3400-\u9fff]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isNearDuplicateFingerprint(left: string, right: string) {
  if (!left || !right) {
    return false
  }

  if (left === right) {
    return true
  }

  const shorter = left.length < right.length ? left : right
  const longer = left.length < right.length ? right : left
  return shorter.length >= 24 && longer.includes(shorter) && shorter.length / longer.length > 0.85
}

function isPureFragment(text: string) {
  const trimmed = text.trim()
  return (
    URL_ONLY_PATTERN.test(trimmed) ||
    HASH_ONLY_PATTERN.test(trimmed) ||
    PATHISH_PATTERN.test(trimmed) ||
    SHELL_FRAGMENT_PATTERN.test(trimmed)
  )
}

function isCandidateLengthValid(text: string) {
  if (text.length > MAX_CANDIDATE_LENGTH) {
    return false
  }

  if (/[\u3400-\u9fff]/.test(text)) {
    return text.length >= MIN_CJK_CANDIDATE_LENGTH
  }

  return text.length >= MIN_CANDIDATE_LENGTH
}

function isUsefulCandidateText(text: string) {
  return (
    isCandidateLengthValid(text) &&
    hasNaturalLanguageSignal(text) &&
    !isPureFragment(text) &&
    !isLikelyPureNoiseText(text)
  )
}

function scoreCandidateText(text: string) {
  const wordCount = text.match(/[A-Za-z]{2,}/g)?.length ?? 0
  const hasCjk = /[\u3400-\u9fff]/.test(text)
  const hasTechnicalTerm = /[-_/]|\b[A-Z][A-Za-z0-9]+[A-Z][A-Za-z0-9]*\b/.test(text)
  const lengthScore = Math.min(text.length / 160, 1)
  const languageScore = hasCjk || wordCount >= 4 ? 0.35 : 0.15
  const termScore = hasTechnicalTerm ? 0.15 : 0
  const symbolPenalty =
    ((text.match(/[{}[\]();=<>|]/g) ?? []).length / Math.max(text.length, 1)) * 0.5

  return lengthScore + languageScore + termScore - symbolPenalty
}

export function mineCandidateGroups(
  turns: CandidateTurn[]
): CandidateGroup[] {
  const fingerprints: string[] = []
  const rows: CandidateRow[] = []

  turns.forEach((turn, turnIndex) => {
    const cleaned = cleanNaturalLanguageText(turn.text)
    for (const [segmentIndex, promptText] of splitCandidateText(cleaned).entries()) {
      if (!isUsefulCandidateText(promptText)) {
        continue
      }

      const fingerprint = normalizeCandidateFingerprint(promptText)
      if (fingerprints.some((seen) => isNearDuplicateFingerprint(seen, fingerprint))) {
        continue
      }

      fingerprints.push(fingerprint)
      rows.push({
        id: `candidate-${turnIndex}-${segmentIndex}`,
        sourceSpanRef: turn.sourceSpanRef ?? `span-${turnIndex}`,
        promptText,
        ...(turn.role ? { role: turn.role } : {}),
        status: 'pending',
        score: scoreCandidateText(promptText),
        originIndex: rows.length
      })
    }
  })

  return rows
    .sort((left, right) => right.score - left.score || left.originIndex - right.originIndex)
    .map(({ score: _score, originIndex: _originIndex, ...candidate }) => candidate)
}
