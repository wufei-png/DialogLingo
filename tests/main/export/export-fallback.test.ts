import { describe, expect, it } from 'vitest'
import { chooseExportFallback } from '../../../src/main/errors/sourceIssues'

describe('chooseExportFallback', () => {
  it('falls back to text bundle if package export fails', () => {
    expect(
      chooseExportFallback({ requested: 'anki-package', failed: true })
    ).toBe('anki-text-bundle')
  })
})
