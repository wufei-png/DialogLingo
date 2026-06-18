import { describe, expect, it } from 'vitest'
import { NAV_SECTIONS } from '../../src/shared/navigation'

describe('NAV_SECTIONS', () => {
  it('declares the two top-level sections in order', () => {
    expect(NAV_SECTIONS).toEqual([
      { id: 'search' },
      { id: 'workbook' }
    ])
  })
})
