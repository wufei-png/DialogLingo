import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertSafeExportOutputName,
  assertValidExportParentDirectory,
  createUniqueExportSubdirectory,
  ensureApkgFileName,
  normalizeExportOutputName
} from '../../../src/main/export/outputDirectory'

describe('export output directories', () => {
  it('normalizes user-provided output names', () => {
    expect(
      normalizeExportOutputName('../Dialog:Lingo/Bundle?', 'Fallback')
    ).toBe('Dialog-Lingo-Bundle')
    expect(normalizeExportOutputName('   ', 'DialogLingo')).toBe('DialogLingo')
    expect(normalizeExportOutputName('CON', 'DialogLingo')).toBe('CON-export')
  })

  it('adds the Anki package extension only when needed', () => {
    expect(ensureApkgFileName('DialogLingo')).toBe('DialogLingo.apkg')
    expect(ensureApkgFileName('DialogLingo.apkg')).toBe('DialogLingo.apkg')
  })

  it('requires a native absolute parent and a single safe output name', () => {
    expect(() => assertValidExportParentDirectory('relative/path')).toThrow(
      'absolute path'
    )
    expect(() => assertValidExportParentDirectory('/tmp\u0000unsafe')).toThrow(
      'absolute path'
    )
    expect(() => assertSafeExportOutputName('../outside')).toThrow(
      'single safe path component'
    )
    expect(() => assertSafeExportOutputName('DialogLingo')).not.toThrow()
  })

  it('creates a new unique subdirectory for bundle exports', async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'dialoglingo-export-'))
    fs.mkdirSync(path.join(parent, 'DialogLingo'))

    const created = await createUniqueExportSubdirectory(parent, 'DialogLingo')

    expect(created).toBe(path.join(parent, 'DialogLingo-2'))
    expect(fs.existsSync(created)).toBe(true)
  })
})
