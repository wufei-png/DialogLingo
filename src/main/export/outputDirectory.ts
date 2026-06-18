import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

export function normalizeExportSubfolderName(
  folderName: string | null | undefined,
  fallbackName: string
) {
  const fallback = sanitizeFolderName(fallbackName) || 'DialogLingo Export'
  return sanitizeFolderName(folderName ?? '') || fallback
}

function sanitizeFolderName(folderName: string) {
  const normalized = folderName
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[. -]+/, '')
    .replace(/[-. ]+$/g, '')
    .slice(0, 80)

  if (!normalized || normalized === '.' || normalized === '..') {
    return ''
  }

  if (WINDOWS_RESERVED_NAMES.test(normalized)) {
    return `${normalized}-export`
  }

  return normalized
}

export async function createUniqueExportSubdirectory(
  parentDirectory: string,
  preferredName: string
) {
  await mkdir(parentDirectory, { recursive: true })

  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? '' : `-${index + 1}`
    const candidate = path.join(parentDirectory, `${preferredName}${suffix}`)

    try {
      await mkdir(candidate)
      return candidate
    } catch (error) {
      if (isNodeError(error) && error.code === 'EEXIST') {
        continue
      }

      throw error
    }
  }

  throw new Error(`Could not create a unique export directory for ${preferredName}`)
}
