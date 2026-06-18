import { describe, expect, it } from 'vitest'
import en from '../../src/renderer/src/i18n/locales/en'
import zhCN from '../../src/renderer/src/i18n/locales/zh-CN'

function collectLeafKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') {
    return [prefix]
  }

  return Object.entries(value)
    .flatMap(([key, child]) =>
      collectLeafKeys(child, prefix ? `${prefix}.${key}` : key)
    )
    .sort()
}

describe('i18n locale resources', () => {
  it('keeps Simplified Chinese keys aligned with English', () => {
    expect(collectLeafKeys(zhCN)).toEqual(collectLeafKeys(en))
  })
})
