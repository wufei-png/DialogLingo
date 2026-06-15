type PrecleanInputTurn = {
  role: string
  text: string
  isToolNoise?: boolean
}

const SECRET_PATTERN = /\bsk-[A-Za-z0-9_-]+\b/g

export function precleanTurns<T extends PrecleanInputTurn>(turns: T[]) {
  return turns
    .filter((turn) => !turn.isToolNoise)
    .map((turn) => {
      const redactedText = turn.text.replace(SECRET_PATTERN, '[redacted-secret]')
      if (redactedText.includes('```')) {
        return {
          ...turn,
          text: '[collapsed code block]'
        }
      }

      return {
        ...turn,
        text: redactedText
      }
    })
}
