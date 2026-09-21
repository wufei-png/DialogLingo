import type { BrowserWindow } from 'electron'
import {
  DEVELOPMENT_CONTENT_SECURITY_POLICY,
  PACKAGED_CONTENT_SECURITY_POLICY
} from '../../shared/security/csp'
import { isAllowedRendererUrl, type RendererTarget } from '../ipc/sender'

export function getRendererContentSecurityPolicy(target: RendererTarget) {
  return target.kind === 'dev'
    ? DEVELOPMENT_CONTENT_SECURITY_POLICY
    : PACKAGED_CONTENT_SECURITY_POLICY
}

export function isAllowedRendererNavigation(
  url: string,
  target: RendererTarget,
  isMainFrame = true
) {
  return isMainFrame && isAllowedRendererUrl(url, target)
}

export function attachRendererWindowSecurity(
  window: BrowserWindow,
  target: RendererTarget
) {
  const { webContents } = window

  webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  webContents.on('will-navigate', (event, url) => {
    if (!isAllowedRendererNavigation(url, target)) {
      event.preventDefault()
    }
  })

  webContents.on('will-frame-navigate', (details) => {
    if (!isAllowedRendererNavigation(details.url, target, details.isMainFrame)) {
      details.preventDefault()
    }
  })

  webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })
}
