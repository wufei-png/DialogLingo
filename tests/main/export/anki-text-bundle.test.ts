import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildAnkiTextBundle,
  writeAnkiTextBundle,
  type ExpressionExportRow,
  type SentenceExportRow
} from '../../../src/main/export/ankiTextBundle'

describe('writeAnkiTextBundle', () => {
  it('writes expression.tsv, sentence.tsv, and manifest.json', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dialoglingo-export-'))

    await writeAnkiTextBundle(dir, {
      workbookId: 'w1',
      expressionRows: [{ source: 'worktree', target: '工作树' }],
      sentenceRows: []
    })

    expect(fs.existsSync(path.join(dir, 'expression.tsv'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'manifest.json'))).toBe(true)
  })

  it('builds manifest and TSV files with Anki-safe escaping', () => {
    const expressions: ExpressionExportRow[] = [
      {
        id: 'expr-1',
        itemType: 'Expression',
        state: 'active',
        expression: 'break\tdown',
        translation: '拆解\n分析',
        gloss: 'break down',
        context: 'Break down the task.',
        explanation: 'Use <carefully> & explain "why".',
        quizPrompt: 'What does break down mean?',
        quizAnswer: 'Analyze step by step.',
        sourceRefs: [
          {
            sessionId: 's1',
            sourceSpanRef: 'fixture:1',
            excerpt: 'Break down the task.',
            sourceType: 'codex'
          }
        ],
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
        focus: 'ship this',
        note: 'Polite delivery question.',
        quizPrompt: 'What is being asked?',
        quizAnswer: 'Whether release can happen today.',
        tags: ['release']
      }
    ]

    const bundle = buildAnkiTextBundle({
      workbookId: 'w1',
      deckName: 'DialogLingo',
      direction: 'bilingual',
      tagPrefix: 'dl',
      generatedAt: '2026-06-15T00:00:00.000Z',
      expressions,
      sentences
    })

    expect(Object.keys(bundle.files).sort()).toEqual([
      'README-import.md',
      'expression.tsv',
      'manifest.json',
      'sentence.tsv'
    ])

    const manifest = JSON.parse(bundle.files['manifest.json'])
    expect(manifest).toMatchObject({
      schemaVersion: 2,
      workbookId: 'w1',
      format: 'anki-text-bundle',
      deckName: 'DialogLingo',
      direction: 'bilingual',
      includedItemTypes: ['Expression', 'Sentence'],
      selectedItemCounts: {
        expressions: 1,
        sentences: 1,
        total: 2
      },
      exportedItemCounts: {
        expressions: 1,
        sentences: 1,
        total: 2
      },
      itemCounts: {
        expressions: 1,
        sentences: 1,
        total: 2
      },
      sourcePlatformSummary: {
        codex: 1
      },
      files: [
        { path: 'expression.tsv' },
        { path: 'sentence.tsv' },
        { path: 'README-import.md' }
      ]
    })

    expect(manifest.files.map((file: { path: string }) => file.path)).toEqual([
      'expression.tsv',
      'sentence.tsv',
      'README-import.md'
    ])
    expect(manifest.files.every((file: { sizeBytes: number; sha256: string }) =>
      file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256)
    )).toBe(true)

    expect(bundle.files['README-import.md']).toContain('DialogLingo::Expression')

    const expressionRows = bundle.files['expression.tsv'].split('\n')
    expect(expressionRows[0]).toBe('Front\tBack\tGloss\tContext\tExplanation\tQuiz\tTags')
    expect(expressionRows[1].split('\t')).toHaveLength(7)
    expect(expressionRows[1]).toContain('break\\tdown')
    expect(expressionRows[1]).toContain('拆解<br>分析')
    expect(expressionRows[1]).toContain('Break down the task.')
    expect(expressionRows[1]).toContain('Prompt: What does break down mean?')
    expect(expressionRows[1]).toContain('&lt;carefully&gt; &amp; explain &quot;why&quot;.')
    expect(expressionRows[1]).toContain('dl::expression agent_chat')

    const sentenceRows = bundle.files['sentence.tsv'].split('\n')
    expect(sentenceRows[0]).toBe('Front\tBack\tFocus\tExplanation\tQuiz\tTags')
    expect(sentenceRows[1]).toContain('Can you ship this today?')
    expect(sentenceRows[1]).toContain('今天能发布吗？')
    expect(sentenceRows[1]).toContain('ship this')
    expect(sentenceRows[1]).toContain('dl::sentence release')
  })
})
