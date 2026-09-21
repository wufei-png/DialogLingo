import { describe, expect, it } from 'vitest'
import {
  createDevRendererTarget,
  createIpcSenderAuthorizer,
  createPackagedRendererTarget
} from '../../../src/main/ipc/sender'

function sender(url: string) {
  const mainFrame = { url }
  return {
    sender: { mainFrame },
    senderFrame: mainFrame
  }
}

describe('IPC sender authorization', () => {
  it('accepts a registered top-level frame from the loopback development origin', () => {
    const authorizer = createIpcSenderAuthorizer(() =>
      createDevRendererTarget('http://localhost:5173/')
    )
    const request = sender('http://localhost:5173/')

    authorizer.register(request.sender)

    expect(authorizer.authorize(request)).toEqual({
      authorized: true,
      reason: null
    })
  })

  it.each([
    ['unknown-webContents', 'unknown sender', () => sender('http://localhost:5173/')],
    ['child-frame', 'child frame', () => {
      const request = sender('http://localhost:5173/')
      request.senderFrame = { url: 'http://localhost:5173/' }
      return request
    }],
    ['unexpected-renderer-url', 'unexpected origin', () => sender('http://localhost:5174/')]
  ] as const)('rejects %s for %s', (reason, _label, makeRequest) => {
    const authorizer = createIpcSenderAuthorizer(() =>
      createDevRendererTarget('http://localhost:5173/')
    )
    const registered = sender('http://localhost:5173/')
    const request = makeRequest()

    authorizer.register(registered.sender)
    if (reason !== 'unknown-webContents') {
      authorizer.register(request.sender)
    }

    expect(authorizer.authorize(request)).toEqual({
      authorized: false,
      reason
    })
  })

  it('requires the exact packaged renderer file URL', () => {
    const authorizer = createIpcSenderAuthorizer(() =>
      createPackagedRendererTarget('file:///app/dist/renderer/index.html')
    )
    const request = sender('file:///app/dist/renderer/index.html')
    authorizer.register(request.sender)

    expect(authorizer.authorize(request).authorized).toBe(true)

    const wrongFile = sender('file:///app/dist/renderer/other.html')
    authorizer.register(wrongFile.sender)
    expect(authorizer.authorize(wrongFile)).toMatchObject({
      authorized: false,
      reason: 'unexpected-renderer-url'
    })
  })

  it('does not allow a non-loopback development URL to become privileged', () => {
    expect(() => createDevRendererTarget('https://example.com/app')).toThrow(
      'loopback HTTP(S) origin'
    )
  })

  it('accepts bracketed IPv6 loopback development URLs', () => {
    expect(createDevRendererTarget('http://[::1]:5173/')).toMatchObject({
      kind: 'dev',
      origin: 'http://[::1]:5173'
    })
  })
})
