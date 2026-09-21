import type { IpcAuthorization } from '../../shared/ipc/context'

export type RendererTarget =
  | {
      kind: 'dev'
      origin: string
    }
  | {
      kind: 'packaged'
      url: string
    }

export type IpcWebFrame = {
  url: string
}

export type IpcWebContents = {
  mainFrame: IpcWebFrame
}

export type IpcSenderEvent = {
  sender: IpcWebContents
  senderFrame: IpcWebFrame | null
}

const IPC_AUTHORIZED: IpcAuthorization = {
  authorized: true,
  reason: null
}

function rejected(reason: string): IpcAuthorization {
  return {
    authorized: false,
    reason
  }
}

function isLoopbackHostname(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

export function createDevRendererTarget(value: string): RendererTarget {
  const url = new URL(value)
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !isLoopbackHostname(url.hostname) ||
    url.username ||
    url.password
  ) {
    throw new Error('ELECTRON_RENDERER_URL must use a loopback HTTP(S) origin.')
  }

  return {
    kind: 'dev',
    origin: url.origin
  }
}

export function createPackagedRendererTarget(url: string): RendererTarget {
  const parsed = new URL(url)
  if (parsed.protocol !== 'file:') {
    throw new Error('Packaged renderer target must use a file URL.')
  }

  return {
    kind: 'packaged',
    url: parsed.href
  }
}

export function isAllowedRendererUrl(url: string, target: RendererTarget) {
  try {
    const actual = new URL(url)
    if (target.kind === 'dev') {
      return actual.origin === target.origin && !actual.username && !actual.password
    }

    return actual.href === target.url
  } catch {
    return false
  }
}

export function createIpcSenderAuthorizer(
  getRendererTarget: () => RendererTarget | null
) {
  const allowedSenders = new Set<IpcWebContents>()

  return {
    register(sender: IpcWebContents) {
      allowedSenders.add(sender)
    },

    unregister(sender: IpcWebContents) {
      allowedSenders.delete(sender)
    },

    authorize(event: IpcSenderEvent): IpcAuthorization {
      if (!allowedSenders.has(event.sender)) {
        return rejected('unknown-webContents')
      }

      if (!event.senderFrame) {
        return rejected('missing-sender-frame')
      }

      if (event.senderFrame !== event.sender.mainFrame) {
        return rejected('child-frame')
      }

      const rendererTarget = getRendererTarget()
      if (!rendererTarget || !isAllowedRendererUrl(event.senderFrame.url, rendererTarget)) {
        return rejected('unexpected-renderer-url')
      }

      return IPC_AUTHORIZED
    }
  }
}
