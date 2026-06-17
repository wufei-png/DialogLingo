import {
  cleanNaturalLanguageText,
  isTurnToolNoise
} from '../text/turnNoise'

export type PrecleanInputTurn = {
  role: string
  text: string
  isToolNoise?: boolean
}

export function precleanTurns<T extends PrecleanInputTurn>(turns: T[]) {
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
