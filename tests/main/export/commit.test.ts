import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildGenericTextBundle } from '../../../src/main/export/genericTextBundle'
import {
  commitExportDirectory,
  EXPORT_COMMIT_FAILURE_POINTS,
  verifyExportDirectory
} from '../../../src/main/export/commit'

function buildOutput(runId = 'run-1') {
  const output = buildGenericTextBundle({
    workbookId: 'w1',
    deckName: 'DialogLingo',
    direction: 'en-zh',
    tagPrefix: 'dialoglingo',
    runId,
    appVersion: '0.2.3',
    includedItemTypes: ['Expression'],
    expressions: [
      {
        id: 'expr-1',
        itemType: 'Expression',
        state: 'active',
        expression: 'ship it',
        translation: '发布它'
      }
    ],
    sentences: []
  })
  const { ['manifest.json']: _manifest, ...payloadFiles } = output.files
  return { output, payloadFiles }
}

describe('committed export directories', () => {
  it('publishes one complete directory with a verifiable manifest', async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'dialoglingo-commit-'))
    const { output, payloadFiles } = buildOutput()

    const committed = await commitExportDirectory({
      parentDirectory: parent,
      preferredName: 'DialogLingo',
      manifest: output.manifest,
      files: payloadFiles
    })

    expect(committed.outputPath).toBe(path.join(parent, 'DialogLingo'))
    expect(committed.files).toEqual([
      'expression.csv',
      'sentence.csv',
      'expression.md',
      'sentence.md',
      'manifest.json'
    ])
    expect(fs.existsSync(path.join(parent, '.DialogLingo'))).toBe(false)
    const manifest = JSON.parse(
      fs.readFileSync(path.join(committed.outputPath, 'manifest.json'), 'utf8')
    )
    expect(manifest.runId).toBe('run-1')
    expect(manifest.files).toHaveLength(4)
    expect(await verifyExportDirectory(committed.outputPath)).toMatchObject({
      valid: true,
      schemaVersion: 2
    })
  })

  it.each(EXPORT_COMMIT_FAILURE_POINTS)(
    'removes staging output when %s fails',
    async (failurePoint) => {
      const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'dialoglingo-commit-'))
      const { output, payloadFiles } = buildOutput()

      await expect(
        commitExportDirectory({
          parentDirectory: parent,
          preferredName: 'DialogLingo',
          manifest: output.manifest,
          files: payloadFiles,
          failurePoint
        })
      ).rejects.toThrow('Injected export failure')

      expect(fs.readdirSync(parent)).toEqual([])
    }
  )

  it('detects payload tampering and still reads a legacy v1 manifest', async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'dialoglingo-commit-'))
    const { output, payloadFiles } = buildOutput()
    const committed = await commitExportDirectory({
      parentDirectory: parent,
      preferredName: 'DialogLingo',
      manifest: output.manifest,
      files: payloadFiles
    })

    fs.writeFileSync(path.join(committed.outputPath, 'expression.csv'), 'tampered')
    await expect(verifyExportDirectory(committed.outputPath)).resolves.toMatchObject({
      valid: false,
      reason: 'checksum mismatch for expression.csv'
    })

    const legacy = path.join(parent, 'Legacy')
    fs.mkdirSync(legacy)
    fs.writeFileSync(path.join(legacy, 'expression.tsv'), 'Front\tBack\n')
    fs.writeFileSync(
      path.join(legacy, 'manifest.json'),
      JSON.stringify({ schemaVersion: 1, files: ['expression.tsv', 'manifest.json'] })
    )
    await expect(verifyExportDirectory(legacy)).resolves.toMatchObject({
      valid: true,
      schemaVersion: 1
    })
  })
})
