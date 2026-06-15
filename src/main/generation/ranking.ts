type RankedInput = {
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

type RankedOutput = RankedInput & {
  rawBaseScore: number
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
  return [...items]
    .map((item) => ({
      ...item,
      rawBaseScore: scoreExpression(item)
    }))
    .sort((left, right) => right.rawBaseScore - left.rawBaseScore)
}

export function rankSentenceItems(items: RankedInput[]): RankedOutput[] {
  return [...items]
    .map((item) => ({
      ...item,
      rawBaseScore: scoreSentence(item)
    }))
    .sort((left, right) => right.rawBaseScore - left.rawBaseScore)
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

  while (expressionQueue.length > 0 || sentenceQueue.length > 0) {
    const expressionCount = result.filter((item) => item.itemType === 'Expression').length
    const sentenceCount = result.length - expressionCount
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
  }

  return result
}
