import { describe, expect, it } from 'vitest'
import {
  buildAnkiPackage,
  writeApkg,
  type AnkiDeckWriter,
  type ExpressionExportRow,
  type SentenceExportRow
} from '../../../src/main/export/apkg'

describe('writeApkg', () => {
  it('returns a non-empty apkg buffer', async () => {
    const buffer = await writeApkg({
      deckName: 'DialogLingo',
      expressionRows: [
        {
          front: 'worktree',
          back: '工作树',
          gloss: 'Git working tree',
          context: 'Use a worktree for isolated changes.',
          explanation: 'Domain term used in coding workflows.',
          quiz: 'What is a worktree?',
          tags: ['dialoglingo::expression']
        }
      ],
      sentenceRows: []
    })

    expect(buffer.byteLength).toBeGreaterThan(0)
  })

  it('maps expression and sentence rows to distinct Anki cards', async () => {
    const cards: Array<{ front: string; back: string; tags: string[] }> = []
    const writer: AnkiDeckWriter = {
      addCard(front, back, options) {
        cards.push({ front, back, tags: options?.tags ?? [] })
      },
      save: async () => Buffer.from('apkg')
    }
    const expressions: ExpressionExportRow[] = [
      {
        id: 'expr-1',
        itemType: 'Expression',
        state: 'active',
        expression: 'break down',
        translation: '拆解',
        explanation: 'Use <explicit> steps.',
        example: 'Break down the task.',
        tags: ['agent chat']
      }
    ]
    const sentences: SentenceExportRow[] = [
      {
        id: 'sent-1',
        itemType: 'Sentence',
        state: 'active',
        sentence: 'Can you ship this today?',
        translation: '今天能发布吗？',
        note: 'Polite delivery question.',
        tags: ['release']
      }
    ]

    const result = await buildAnkiPackage(
      {
        deckName: 'DialogLingo',
        direction: 'en-zh',
        tagPrefix: 'dl',
        generatedAt: '2026-06-15T00:00:00.000Z',
        expressions,
        sentences
      },
      {
        createDeck(deckName) {
          expect(deckName).toBe('DialogLingo')
          return writer
        }
      }
    )

    expect(cards).toHaveLength(2)
    expect(cards[0]).toMatchObject({
      front: 'break down',
      tags: ['dl::expression', 'agent_chat']
    })
    expect(cards[0]?.back).toContain('拆解')
    expect(cards[0]?.back).toContain('&lt;explicit&gt;')
    expect(cards[1]).toMatchObject({
      front: 'Can you ship this today?',
      tags: ['dl::sentence', 'release']
    })
    expect(cards[1]?.back).toContain('今天能发布吗？')
    expect(result.data).toEqual(Buffer.from('apkg'))
    expect(result.manifest).toMatchObject({
      format: 'anki-package',
      itemCounts: {
        expressions: 1,
        sentences: 1,
        total: 2
      }
    })
  })
})
