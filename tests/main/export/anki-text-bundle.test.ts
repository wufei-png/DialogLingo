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
        explanation: 'Use <carefully> & explain "why".',
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

    const bundle = buildAnkiTextBundle({
      deckName: 'DialogLingo',
      direction: 'bilingual',
      tagPrefix: 'dl',
      generatedAt: '2026-06-15T00:00:00.000Z',
      expressions,
      sentences
    })

    expect(Object.keys(bundle.files).sort()).toEqual([
      'expressions.tsv',
      'manifest.json',
      'sentences.tsv'
    ])

    const manifest = JSON.parse(bundle.files['manifest.json'])
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      format: 'anki-text-bundle',
      deckName: 'DialogLingo',
      direction: 'bilingual',
      itemCounts: {
        expressions: 1,
        sentences: 1,
        total: 2
      },
      files: ['expressions.tsv', 'sentences.tsv']
    })

    const expressionRows = bundle.files['expressions.tsv'].split('\n')
    expect(expressionRows[0]).toBe('front\tback\ttags')
    expect(expressionRows[1].split('\t')).toHaveLength(3)
    expect(expressionRows[1]).toContain('break\\tdown')
    expect(expressionRows[1]).toContain('拆解<br>分析')
    expect(expressionRows[1]).toContain('&lt;carefully&gt; &amp; explain &quot;why&quot;.')
    expect(expressionRows[1]).toContain('dl::expression agent_chat')

    const sentenceRows = bundle.files['sentences.tsv'].split('\n')
    expect(sentenceRows[1]).toContain('Can you ship this today?')
    expect(sentenceRows[1]).toContain('今天能发布吗？')
    expect(sentenceRows[1]).toContain('dl::sentence release')
  })
})
