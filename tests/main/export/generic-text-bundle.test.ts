import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildGenericTextBundle,
  writeGenericTextBundle,
  type ExpressionExportRow,
  type SentenceExportRow
} from '../../../src/main/export/genericTextBundle'

describe('writeGenericTextBundle', () => {
  it('writes csv, markdown, and manifest bundle files', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dialoglingo-export-'))

    await writeGenericTextBundle(dir, {
      workbookId: 'w1',
      expressionRows: [{ source: 'worktree', target: '工作树' }],
      sentenceRows: [{ source: 'Use a worktree for isolated changes.', target: '用工作树隔离修改。' }]
    })

    expect(fs.existsSync(path.join(dir, 'expression.csv'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'sentence.md'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'manifest.json'))).toBe(true)
  })

  it('builds manifest, CSV, and JSONL files with CSV escaping', () => {
    const expressions: ExpressionExportRow[] = [
      {
        id: 'expr-1',
        itemType: 'Expression',
        state: 'active',
        expression: 'break down, not "skip"',
        translation: '拆解，不要跳过',
        gloss: 'break down',
        context: 'Break down the task.',
        explanation: 'Useful for reviews',
        quizPrompt: 'What does it mean?',
        quizAnswer: 'Analyze instead of skipping.',
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
        sentence: 'Ship it, then verify.',
        translation: '先发布，然后验证。',
        focus: 'ship it',
        context: 'Ship it, then verify.',
        note: 'Imperative workflow sentence',
        quizPrompt: 'What should happen after shipping?',
        quizAnswer: 'Verify it.',
        sourceRefs: [
          {
            sessionId: 's2',
            sourceSpanRef: 'fixture:2',
            excerpt: 'Ship it, then verify.',
            sourceType: 'claude'
          }
        ],
        tags: ['release']
      }
    ]

    const bundle = buildGenericTextBundle({
      workbookId: 'w1',
      deckName: 'DialogLingo',
      direction: 'en-zh',
      tagPrefix: 'dl',
      generatedAt: '2026-06-15T00:00:00.000Z',
      expressions,
      sentences
    })

    expect(Object.keys(bundle.files).sort()).toEqual([
      'expression.csv',
      'expression.md',
      'manifest.json',
      'sentence.csv',
      'sentence.md'
    ])

    const manifest = JSON.parse(bundle.files['manifest.json'])
    expect(manifest).toMatchObject({
      schemaVersion: 2,
      workbookId: 'w1',
      format: 'generic-text-bundle',
      deckName: 'DialogLingo',
      itemCounts: {
        expressions: 1,
        sentences: 1,
        total: 2
      },
      sourcePlatformSummary: {
        codex: 1,
        claude: 1
      },
      files: [
        { path: 'expression.csv' },
        { path: 'sentence.csv' },
        { path: 'expression.md' },
        { path: 'sentence.md' }
      ]
    })

    expect(manifest.files.map((file: { path: string }) => file.path)).toEqual([
      'expression.csv',
      'sentence.csv',
      'expression.md',
      'sentence.md'
    ])
    expect(manifest.files.every((file: { sizeBytes: number; sha256: string }) =>
      file.sizeBytes > 0 && /^[a-f0-9]{64}$/.test(file.sha256)
    )).toBe(true)

    expect(bundle.files['expression.csv']).toContain('"break down, not ""skip"""')
    expect(bundle.files['expression.csv']).toContain('Analyze instead of skipping.')
    expect(bundle.files['sentence.csv']).toContain('"Ship it, then verify."')
    expect(bundle.files['expression.md']).toContain('## break down, not &quot;skip&quot;')
    expect(bundle.files['expression.md']).toContain('Source refs: codex:s1:fixture:1')
    expect(bundle.files['sentence.md']).toContain('Focus: ship it')
  })
})
