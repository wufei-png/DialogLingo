export const SECRET_PATTERN = /\bsk-[A-Za-z0-9_-]+\b/g

// These rules protect generation prompts and search indexing. Search keeps
// raw non-noise turns, but pure tool/log/code noise is not indexed.
const FENCED_CODE_BLOCK_PATTERN = /```[\s\S]*?```/g
const TOOL_ENVELOPE_PATTERN =
  /^<(environment_context|local-command|command-name|command-message|command-args|local-command-stdout)\b/i
const TOOL_ENVELOPE_END_PATTERN =
  /<\/(environment_context|local-command|command-name|command-message|command-args|local-command-stdout)>\s*$/i
const URL_ONLY_PATTERN = /^(https?:\/\/|file:\/\/)\S+$/i
const HASH_ONLY_PATTERN = /^[a-f0-9]{32,}$/i
const PATHISH_PATTERN =
  /^((~|\.)?\/|[A-Za-z]:\\)[^\s]+(?::\d+(?::\d+)?)?$/
const SHELL_PROMPT_PATTERN = /^([$>%])\s+\S+/
const SHELL_COMMAND_PATTERN =
  /^(npm|pnpm|yarn|node|python3?|git|gh|glab|docker|kubectl|curl|sed|rg|grep|cat|ls|cd|mkdir|rm|cp|mv|tsx)\b(?:\s+[-\w./:=@,]+){0,12}$/i
const LOG_LINE_PATTERN =
  /^(?:\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}|npm ERR!|ERR!|WARN|INFO|DEBUG|TRACE|error:|fatal:|warning:)(?:\s|\b)/i
const STACK_LINE_PATTERN = /^\s*(at\s+\S+|Caused by:|Traceback \(most recent call last\):|File ".+", line \d+)/i
const CODE_LINE_PATTERN =
  /^\s*(import|export|const|let|var|function|class|interface|type|return|if|else|for|while|switch|case|try|catch)\b.*[;{}()]?\s*$/
const ASSIGNMENT_ONLY_PATTERN = /^[A-Z0-9_]{3,}\s*=\s*\S+$/i

export function redactSensitiveText(text: string) {
  return text.replace(SECRET_PATTERN, '[redacted-secret]')
}

export function stripNoisyBlocks(text: string) {
  return text.replace(FENCED_CODE_BLOCK_PATTERN, '\n')
}

export function normalizeNaturalText(text: string) {
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function hasNaturalLanguageSignal(text: string) {
  const hasCjk = /[\u3400-\u9fff]/.test(text)
  const latinWords = text.match(/[A-Za-z]{2,}/g) ?? []

  return hasCjk || latinWords.length >= 2
}

function isToolEnvelope(text: string) {
  const trimmed = text.trim()
  return TOOL_ENVELOPE_PATTERN.test(trimmed) || TOOL_ENVELOPE_END_PATTERN.test(trimmed)
}

function isJsonPayload(text: string) {
  const trimmed = text.trim()
  if (trimmed.length < 24) {
    return false
  }

  return (
    ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) &&
    /["}\]]\s*[:,]/.test(trimmed)
  )
}

export function isNoisyLine(line: string) {
  const trimmed = line.trim()
  if (!trimmed) {
    return false
  }

  if (
    isToolEnvelope(trimmed) ||
    URL_ONLY_PATTERN.test(trimmed) ||
    HASH_ONLY_PATTERN.test(trimmed) ||
    PATHISH_PATTERN.test(trimmed) ||
    SHELL_PROMPT_PATTERN.test(trimmed) ||
    SHELL_COMMAND_PATTERN.test(trimmed) ||
    LOG_LINE_PATTERN.test(trimmed) ||
    STACK_LINE_PATTERN.test(trimmed) ||
    ASSIGNMENT_ONLY_PATTERN.test(trimmed)
  ) {
    return true
  }

  if (CODE_LINE_PATTERN.test(trimmed) && /[;{}()]|=>/.test(trimmed)) {
    return true
  }

  return false
}

export function isLikelyPureNoiseText(text: string) {
  const redacted = redactSensitiveText(text).trim()
  if (!redacted) {
    return true
  }

  if (isToolEnvelope(redacted) || isJsonPayload(redacted)) {
    return true
  }

  const withoutBlocks = stripNoisyBlocks(redacted).trim()
  if (!withoutBlocks) {
    return true
  }

  const lines = withoutBlocks
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return true
  }

  const noisyCount = lines.filter(isNoisyLine).length
  const naturalCount = lines.filter(
    (line) => hasNaturalLanguageSignal(line) && !isNoisyLine(line)
  ).length

  // Prefer keeping mixed natural-language turns unless the noisy structure
  // clearly dominates and there is no usable learning signal left.
  if (noisyCount === lines.length) {
    return true
  }

  if (lines.length >= 3 && noisyCount / lines.length >= 0.7 && naturalCount === 0) {
    return true
  }

  const symbolCount = (withoutBlocks.match(/[{}[\]();=<>|]/g) ?? []).length
  const symbolRatio = symbolCount / Math.max(withoutBlocks.length, 1)

  return naturalCount === 0 && symbolRatio > 0.2
}

export function cleanNaturalLanguageText(text: string) {
  const redacted = redactSensitiveText(text)
  const withoutBlocks = stripNoisyBlocks(redacted)
  const lines = withoutBlocks.split(/\r?\n/)
  const hasNaturalLine = lines.some(
    (line) => hasNaturalLanguageSignal(line) && !isNoisyLine(line)
  )

  if (!hasNaturalLine) {
    return normalizeNaturalText(withoutBlocks)
  }

  // Once a turn has at least one useful line, drop surrounding tool/log clutter
  // instead of discarding the whole turn.
  return normalizeNaturalText(
    lines
      .filter((line) => {
        const trimmed = line.trim()
        return !trimmed || !isNoisyLine(trimmed)
      })
      .join('\n')
  )
}

export function isTurnToolNoise(input: { text: string; isToolNoise?: boolean }) {
  return input.isToolNoise === true || isLikelyPureNoiseText(input.text)
}
