export const TRIVIAL_EXPRESSION_SOURCE_TEXTS = [
  'hi',
  'hello',
  'hey',
  'thanks',
  'thank you',
  'yes',
  'no',
  'ok',
  'okay',
  'sorry',
  'excuse me'
] as const

const TRIVIAL_EXPRESSION_SET = new Set<string>(TRIVIAL_EXPRESSION_SOURCE_TEXTS)

export function normalizeLearningItemSourceText(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'`.,!?;:()[\]{}<>]+|[\s"'`.,!?;:()[\]{}<>]+$/g, '')
    .replace(/\s+/g, ' ')
}

export function isTrivialExpressionSourceText(value: string) {
  return TRIVIAL_EXPRESSION_SET.has(normalizeLearningItemSourceText(value))
}
