import {
  cleanNaturalLanguageText,
  isTurnToolNoise
} from '../text/turnNoise'

export type RedactionInputTurn = {
  role: string
  text: string
  isToolNoise?: boolean
}

export function redactTurns<T extends RedactionInputTurn>(turns: T[]) {
  return turns.flatMap((turn) => {
    if (isTurnToolNoise(turn)) {
      return []
    }

    const text = cleanNaturalLanguageText(turn.text)
    if (!text || isTurnToolNoise({ text })) {
      return []
    }

    return [
      {
        ...turn,
        text
      }
    ]
  })
}
