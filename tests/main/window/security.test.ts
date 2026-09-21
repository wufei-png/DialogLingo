import { describe, expect, it } from 'vitest'
import {
  createDevRendererTarget,
  createPackagedRendererTarget
} from '../../../src/main/ipc/sender'
import {
  getRendererContentSecurityPolicy,
  isAllowedRendererNavigation
} from '../../../src/main/window/security'

describe('renderer window security policy', () => {
  it('allows only same-origin top-level development navigation', () => {
    const target = createDevRendererTarget('http://localhost:5173/')

    expect(isAllowedRendererNavigation('http://localhost:5173/settings', target)).toBe(true)
    expect(isAllowedRendererNavigation('https://example.com', target)).toBe(false)
    expect(isAllowedRendererNavigation('http://localhost:5173/frame', target, false)).toBe(false)
  })

  it('allows only the packaged renderer file', () => {
    const target = createPackagedRendererTarget('file:///app/dist/renderer/index.html')

    expect(isAllowedRendererNavigation('file:///app/dist/renderer/index.html', target)).toBe(true)
    expect(isAllowedRendererNavigation('file:///app/dist/renderer/other.html', target)).toBe(false)
  })

  it('keeps development and packaged CSP capabilities distinct', () => {
    const development = getRendererContentSecurityPolicy(
      createDevRendererTarget('http://localhost:5173/')
    )
    const packaged = getRendererContentSecurityPolicy(
      createPackagedRendererTarget('file:///app/dist/renderer/index.html')
    )

    expect(development).toContain("connect-src 'self' http://localhost:*")
    expect(development).toContain("ws://localhost:*")
    expect(packaged).toContain("connect-src 'self';")
    expect(packaged).not.toContain('localhost')
    expect(packaged).toContain("object-src 'none'")
  })
})
