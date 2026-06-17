export type RankedInput = {
  id: string
  recurrenceScore: number
  domainScore: number
  contextScore: number
  languageGapScore: number
  usefulnessScore: number
  sourceQualityScore: number
  noisePenalty: number
  dupPenalty: number
}

export type RankedOutput = RankedInput & {
  rawBaseScore: number
}

export type TypeBalanceRankProfile = {
  targetExpression: number
  targetSentence: number
  lambda: number
}

type RankableWorkbookItem = {
  id: string
  itemType: 'Expression' | 'Sentence'
  generatedSnapshot: {
    sourceText: string
    targetText: string
    contextText: string
    explanation: string
    tags: string[]
  }
  sourceRefs: Array<{
    excerpt: string
  }>
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function scoreExpression(item: RankedInput) {
  return (
    0.25 * clamp01(item.recurrenceScore) +
    0.25 * clamp01(item.domainScore) +
    0.2 * clamp01(item.contextScore) +
    0.15 * clamp01(item.languageGapScore) +
    0.1 * clamp01(item.usefulnessScore) +
    0.05 * clamp01(item.sourceQualityScore) -
    0.15 * clamp01(item.noisePenalty) -
    0.1 * clamp01(item.dupPenalty)
  )
}

function scoreSentence(item: RankedInput) {
  return (
    0.1 * clamp01(item.recurrenceScore) +
    0.15 * clamp01(item.domainScore) +
    0.3 * clamp01(item.contextScore) +
    0.25 * clamp01(item.languageGapScore) +
    0.15 * clamp01(item.usefulnessScore) +
    0.05 * clamp01(item.sourceQualityScore) -
    0.15 * clamp01(item.noisePenalty) -
    0.1 * clamp01(item.dupPenalty)
  )
}

export function rankExpressionItems(items: RankedInput[]): RankedOutput[] {
  return items
    .map((item, index) => ({
      index,
      item: {
        ...item,
        rawBaseScore: scoreExpression(item)
      }
    }))
    .sort((left, right) => right.item.rawBaseScore - left.item.rawBaseScore || left.index - right.index)
    .map((entry) => entry.item)
}

export function rankSentenceItems(items: RankedInput[]): RankedOutput[] {
  return items
    .map((item, index) => ({
      index,
      item: {
        ...item,
        rawBaseScore: scoreSentence(item)
      }
    }))
    .sort((left, right) => right.item.rawBaseScore - left.item.rawBaseScore || left.index - right.index)
    .map((entry) => entry.item)
}

export function applyTypeBalanceRerank(input: {
  expressionItems: Array<{ id: string; rawBaseScore: number }>
  sentenceItems: Array<{ id: string; rawBaseScore: number }>
  targetExpression: number
  targetSentence: number
  lambda: number
}) {
  const expressionQueue = [...input.expressionItems]
  const sentenceQueue = [...input.sentenceItems]
  const result: Array<{
    id: string
    itemType: 'Expression' | 'Sentence'
    order: number
  }> = []
  let expressionCount = 0
  let sentenceCount = 0

  while (expressionQueue.length > 0 || sentenceQueue.length > 0) {
    const currentTotal = result.length || 1
    const currentExpressionRatio = expressionCount / currentTotal
    const currentSentenceRatio = sentenceCount / currentTotal

    const nextExpressionScore =
      expressionQueue[0]?.rawBaseScore ?? Number.NEGATIVE_INFINITY
    const nextSentenceScore =
      sentenceQueue[0]?.rawBaseScore ?? Number.NEGATIVE_INFINITY

    const expressionAdjusted =
      nextExpressionScore +
      input.lambda * (input.targetExpression - currentExpressionRatio)
    const sentenceAdjusted =
      nextSentenceScore +
      input.lambda * (input.targetSentence - currentSentenceRatio)

    if (expressionAdjusted >= sentenceAdjusted) {
      const next = expressionQueue.shift()
      if (!next) {
        continue
      }

      result.push({
        id: next.id,
        itemType: 'Expression',
        order: result.length
      })
      expressionCount += 1
      continue
    }

    const next = sentenceQueue.shift()
    if (!next) {
      continue
    }

    result.push({
      id: next.id,
      itemType: 'Sentence',
      order: result.length
    })
    sentenceCount += 1
  }

  return result
}

function textLengthScore(value: string, targetLength: number) {
  return clamp01(value.trim().length / targetLength)
}

function hasAsciiWord(value: string) {
  return /[A-Za-z]/.test(value)
}

function hasCjk(value: string) {
  return /[\u3400-\u9fff]/.test(value)
}

function calculateLanguageGapScore(sourceText: string, targetText: string) {
  const sourceHasEnglish = hasAsciiWord(sourceText)
  const sourceHasChinese = hasCjk(sourceText)
  const targetHasEnglish = hasAsciiWord(targetText)
  const targetHasChinese = hasCjk(targetText)

  if (
    (sourceHasEnglish && targetHasChinese) ||
    (sourceHasChinese && targetHasEnglish)
  ) {
    return 1
  }

  if ((sourceHasEnglish && sourceHasChinese) || (targetHasEnglish && targetHasChinese)) {
    return 0.8
  }

  return 0.5
}

function calculateDomainScore(item: RankableWorkbookItem) {
  const haystack = [
    item.generatedSnapshot.sourceText,
    item.generatedSnapshot.contextText,
    item.generatedSnapshot.explanation,
    item.generatedSnapshot.tags.join(' ')
  ].join(' ').toLowerCase()
  const domainSignals = [
    'api',
    'app',
    'cli',
    'code',
    'config',
    'database',
    'error',
    'export',
    'model',
    'prompt',
    'session',
    'settings',
    'test',
    'ui',
    'workflow'
  ]
  const hits = domainSignals.filter((signal) => haystack.includes(signal)).length

  return clamp01(0.35 + hits * 0.15)
}

function calculateUsefulnessScore(item: RankableWorkbookItem) {
  const sourceText = item.generatedSnapshot.sourceText.trim()
  const lengthScore =
    item.itemType === 'Expression'
      ? sourceText.length >= 3 && sourceText.length <= 80
        ? 0.75
        : textLengthScore(sourceText, 80)
      : sourceText.length >= 18 && sourceText.length <= 220
        ? 0.75
        : textLengthScore(sourceText, 220)
  const tagBonus = Math.min(item.generatedSnapshot.tags.length, 3) * 0.05

  return clamp01(lengthScore + tagBonus)
}

function calculateSourceQualityScore(item: RankableWorkbookItem) {
  const provenanceScore = item.sourceRefs.length > 0 ? 0.55 : 0
  const excerptScore = item.sourceRefs.some((ref) => ref.excerpt.trim().length >= 20)
    ? 0.35
    : 0.1

  return clamp01(provenanceScore + excerptScore)
}

function calculateNoisePenalty(item: RankableWorkbookItem) {
  const sourceText = item.generatedSnapshot.sourceText.trim()
  const lowered = sourceText.toLowerCase()
  let penalty = 0

  if (lowered === '[collapsed code block]' || lowered.includes('```')) {
    penalty += 0.9
  }
  if (/https?:\/\/|\/[\w.-]+\/[\w./-]+/.test(sourceText)) {
    penalty += 0.45
  }
  if (/\b[a-f0-9]{24,}\b/i.test(sourceText)) {
    penalty += 0.4
  }
  if (/^\s*(npm|pnpm|yarn|git|curl|docker)\s+/.test(lowered)) {
    penalty += 0.35
  }

  return clamp01(penalty)
}

function toRankedInput(item: RankableWorkbookItem, maxOccurrenceCount: number): RankedInput {
  const occurrenceCount = Math.max(1, item.sourceRefs.length)
  const recurrenceScore =
    Math.log(1 + occurrenceCount) / Math.log(1 + Math.max(1, maxOccurrenceCount))

  return {
    id: item.id,
    recurrenceScore: clamp01(recurrenceScore),
    domainScore: calculateDomainScore(item),
    contextScore: clamp01(
      0.65 * textLengthScore(item.generatedSnapshot.contextText, 220) +
      0.35 * textLengthScore(item.generatedSnapshot.explanation, 260)
    ),
    languageGapScore: calculateLanguageGapScore(
      item.generatedSnapshot.sourceText,
      item.generatedSnapshot.targetText
    ),
    usefulnessScore: calculateUsefulnessScore(item),
    sourceQualityScore: calculateSourceQualityScore(item),
    noisePenalty: calculateNoisePenalty(item),
    dupPenalty: 0
  }
}

export function rankWorkbookItems<T extends RankableWorkbookItem>(
  items: T[],
  profile: TypeBalanceRankProfile
): T[] {
  if (items.length <= 1) {
    return items
  }

  const maxOccurrenceCount = Math.max(
    1,
    ...items.map((item) => item.sourceRefs.length)
  )
  const expressionItems = items.filter((item) => item.itemType === 'Expression')
  const sentenceItems = items.filter((item) => item.itemType === 'Sentence')
  const rankedExpressions = rankExpressionItems(
    expressionItems.map((item) => toRankedInput(item, maxOccurrenceCount))
  )
  const rankedSentences = rankSentenceItems(
    sentenceItems.map((item) => toRankedInput(item, maxOccurrenceCount))
  )
  const order = applyTypeBalanceRerank({
    expressionItems: rankedExpressions,
    sentenceItems: rankedSentences,
    targetExpression: profile.targetExpression,
    targetSentence: profile.targetSentence,
    lambda: profile.lambda
  })
  const byId = new Map(items.map((item) => [item.id, item]))

  return order.flatMap((entry) => {
    const item = byId.get(entry.id)
    return item ? [item] : []
  })
}
