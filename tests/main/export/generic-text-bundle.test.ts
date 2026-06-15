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
        explanation: 'Useful for reviews',
        example: 'Break down the task.',
        source: 'codex',
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
        note: 'Imperative workflow sentence',
        source: 'codex',
        tags: ['release']
      }
    ]

    const bundle = buildGenericTextBundle({
      deckName: 'DialogLingo',
      direction: 'en-zh',
      tagPrefix: 'dl',
      generatedAt: '2026-06-15T00:00:00.000Z',
      expressions,
      sentences
    })

    expect(Object.keys(bundle.files).sort()).toEqual([
      'expressions.csv',
      'items.jsonl',
      'manifest.json',
      'sentences.csv'
    ])

    const manifest = JSON.parse(bundle.files['manifest.json'])
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      format: 'generic-text-bundle',
      deckName: 'DialogLingo',
      itemCounts: {
        expressions: 1,
        sentences: 1,
        total: 2
      },
      files: ['expressions.csv', 'sentences.csv', 'items.jsonl']
    })

    expect(bundle.files['expressions.csv']).toContain('"break down, not ""skip"""')
    expect(bundle.files['sentences.csv']).toContain('"Ship it, then verify."')

    const jsonLines = bundle.files['items.jsonl'].trim().split('\n').map((line) => JSON.parse(line))
    expect(jsonLines.map((line) => line.itemType)).toEqual(['Expression', 'Sentence'])
    expect(jsonLines[0]).toMatchObject({
      id: 'expr-1',
      expression: 'break down, not "skip"'
    })
  })
})
