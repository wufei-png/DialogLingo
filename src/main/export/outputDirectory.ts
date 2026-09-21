import crypto from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { access } from 'node:fs/promises'
import path from 'node:path'

const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

export function normalizeExportOutputName(
  outputName: string | null | undefined,
  fallbackName: string
) {
  const fallback = sanitizeFolderName(fallbackName) || 'DialogLingo Export'
  return sanitizeFolderName(outputName ?? '') || fallback
}

export function ensureApkgFileName(outputName: string) {
  return outputName.toLowerCase().endsWith('.apkg') ? outputName : `${outputName}.apkg`
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

export interface ExportDirectoryPlan {
  parentDirectory: string
  finalDirectory: string
  stagingDirectory: string
}

export async function createExportDirectoryPlan(
  parentDirectory: string,
  preferredName: string
): Promise<ExportDirectoryPlan> {
  await mkdir(parentDirectory, { recursive: true })
  const finalDirectory = await findAvailableExportDirectory(
    parentDirectory,
    preferredName
  )
  const stagingDirectory = path.join(
    parentDirectory,
    `.${path.basename(finalDirectory)}.${crypto.randomUUID()}.staging`
  )
  await mkdir(stagingDirectory)

  return {
    parentDirectory,
    finalDirectory,
    stagingDirectory
  }
}

async function findAvailableExportDirectory(
  parentDirectory: string,
  preferredName: string
) {
  const normalizedName = normalizeExportOutputName(preferredName, 'DialogLingo Export')

  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? '' : `-${index + 1}`
    const candidate = path.join(parentDirectory, `${normalizedName}${suffix}`)
    if (!(await pathExists(candidate))) {
      return candidate
    }
  }

  throw new Error(`Could not create a unique export directory for ${normalizedName}`)
}

async function pathExists(candidate: string) {
  try {
    await access(candidate)
    return true
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}
