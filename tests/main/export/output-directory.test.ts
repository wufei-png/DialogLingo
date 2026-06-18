import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createUniqueExportSubdirectory,
  normalizeExportSubfolderName
} from '../../../src/main/export/outputDirectory'

describe('export output directories', () => {
  it('normalizes user-provided bundle folder names', () => {
    expect(
      normalizeExportSubfolderName('../Dialog:Lingo/Bundle?', 'Fallback')
    ).toBe('Dialog-Lingo-Bundle')
    expect(normalizeExportSubfolderName('   ', 'DialogLingo')).toBe('DialogLingo')
    expect(normalizeExportSubfolderName('CON', 'DialogLingo')).toBe('CON-export')
  })

  it('creates a new unique subdirectory for bundle exports', async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'dialoglingo-export-'))
    fs.mkdirSync(path.join(parent, 'DialogLingo'))

    const created = await createUniqueExportSubdirectory(parent, 'DialogLingo')

    expect(created).toBe(path.join(parent, 'DialogLingo-2'))
    expect(fs.existsSync(created)).toBe(true)
  })
})
