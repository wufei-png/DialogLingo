import { readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  createExportFileEntry,
  type ExportManifest,
  type ExportManifestFile
} from './manifest'
import { createExportDirectoryPlan } from './outputDirectory'

export const EXPORT_COMMIT_FAILURE_POINTS = [
  'payload-write',
  'manifest-write',
  'verify',
  'rename'
] as const
export type ExportCommitFailurePoint = (typeof EXPORT_COMMIT_FAILURE_POINTS)[number]

export type ExportArtifact = string | Uint8Array

export interface ExportCommitResult {
  outputPath: string
  manifestPath: string
  files: string[]
  manifest: ExportManifest
}

export interface ExportCommitInput {
  parentDirectory: string
  preferredName: string
  manifest: ExportManifest
  files: Record<string, ExportArtifact>
  failurePoint?: ExportCommitFailurePoint
}

export async function commitExportDirectory(
  input: ExportCommitInput
): Promise<ExportCommitResult> {
  const plan = await createExportDirectoryPlan(
    input.parentDirectory,
    input.preferredName
  )

  try {
    const payloadFiles = Object.entries(input.files).filter(
      ([filePath]) => filePath !== 'manifest.json'
    )
    for (const [filePath, contents] of payloadFiles) {
      assertSafeExportFilePath(filePath)
      if (input.failurePoint === 'payload-write') {
        throw new Error(`Injected export failure at payload write: ${filePath}`)
      }
      await writeFile(path.join(plan.stagingDirectory, filePath), contents)
    }

    const manifestFiles = await readManifestFiles(plan.stagingDirectory, payloadFiles)
    const manifest: ExportManifest = {
      ...input.manifest,
      files: manifestFiles
    }

    if (input.failurePoint === 'manifest-write') {
      throw new Error('Injected export failure at manifest write')
    }
    await writeFile(
      path.join(plan.stagingDirectory, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8'
    )

    if (input.failurePoint === 'verify') {
      throw new Error('Injected export failure at export verification')
    }
    const verification = await verifyExportDirectory(plan.stagingDirectory)
    if (!verification.valid) {
      throw new Error(`Export verification failed: ${verification.reason}`)
    }

    if (input.failurePoint === 'rename') {
      throw new Error('Injected export failure at export rename')
    }
    await rename(plan.stagingDirectory, plan.finalDirectory)

    return {
      outputPath: plan.finalDirectory,
      manifestPath: path.join(plan.finalDirectory, 'manifest.json'),
      files: [...payloadFiles.map(([filePath]) => filePath), 'manifest.json'],
      manifest
    }
  } catch (error) {
    await rm(plan.stagingDirectory, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

export type ExportDirectoryVerification =
  | {
      valid: true
      schemaVersion: 1 | 2
      files: string[]
      manifest: ExportManifest | Record<string, unknown>
    }
  | {
      valid: false
      reason: string
    }

export async function verifyExportDirectory(
  directory: string
): Promise<ExportDirectoryVerification> {
  try {
    const manifestPath = path.join(directory, 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>
    if (manifest.schemaVersion === 1) {
      return verifyLegacyManifest(directory, manifest)
    }
    if (manifest.schemaVersion !== 2) {
      return { valid: false, reason: 'unsupported manifest schema version' }
    }

    const files = manifest.files
    if (!Array.isArray(files) || !files.every(isManifestFile)) {
      return { valid: false, reason: 'manifest files are not checksummed entries' }
    }

    for (const file of files) {
      assertSafeExportFilePath(file.path)
      const filePath = path.join(directory, file.path)
      const contents = await readFile(filePath)
      const actual = createExportFileEntry(file.path, contents)
      if (
        actual.sizeBytes !== file.sizeBytes ||
        actual.sha256 !== file.sha256
      ) {
        return { valid: false, reason: `checksum mismatch for ${file.path}` }
      }
    }

    const actualNames = await readdir(directory)
    const expectedNames = new Set(['manifest.json', ...files.map((file) => file.path)])
    if (
      actualNames.length !== expectedNames.size ||
      actualNames.some((filePath) => !expectedNames.has(filePath))
    ) {
      return { valid: false, reason: 'directory contents do not match manifest' }
    }

    return {
      valid: true,
      schemaVersion: 2,
      files: [...files.map((file) => file.path), 'manifest.json'],
      manifest: manifest as unknown as ExportManifest
    }
  } catch (error) {
    return {
      valid: false,
      reason: error instanceof Error ? error.message : String(error)
    }
  }
}

async function readManifestFiles(
  stagingDirectory: string,
  payloadFiles: Array<[string, ExportArtifact]>
): Promise<ExportManifestFile[]> {
  return Promise.all(
    payloadFiles.map(async ([filePath]) => {
      const contents = await readFile(path.join(stagingDirectory, filePath))
      return createExportFileEntry(filePath, contents)
    })
  )
}

async function verifyLegacyManifest(
  directory: string,
  manifest: Record<string, unknown>
): Promise<ExportDirectoryVerification> {
  const files = manifest.files
  if (!Array.isArray(files) || !files.every((file) => typeof file === 'string')) {
    return { valid: false, reason: 'legacy manifest files are invalid' }
  }

  return verifyFileNames(directory, files, manifest)
}

async function verifyFileNames(
  directory: string,
  files: string[],
  manifest: Record<string, unknown>
): Promise<ExportDirectoryVerification> {
  try {
    for (const file of files) {
      assertSafeExportFilePath(file, true)
      await stat(path.join(directory, file))
    }
    return {
      valid: true,
      schemaVersion: 1,
      files: files.includes('manifest.json') ? files : [...files, 'manifest.json'],
      manifest
    }
  } catch (error) {
    return {
      valid: false,
      reason: error instanceof Error ? error.message : String(error)
    }
  }
}

function isManifestFile(value: unknown): value is ExportManifestFile {
  if (value === null || typeof value !== 'object') {
    return false
  }
  const file = value as Partial<ExportManifestFile>
  return (
    typeof file.path === 'string' &&
    typeof file.sizeBytes === 'number' &&
    Number.isInteger(file.sizeBytes) &&
    file.sizeBytes >= 0 &&
    typeof file.sha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(file.sha256)
  )
}

function assertSafeExportFilePath(filePath: string, allowManifest = false) {
  if (
    !filePath ||
    path.isAbsolute(filePath) ||
    (!allowManifest && filePath === 'manifest.json') ||
    filePath.includes('/') ||
    filePath.includes('\\') ||
    filePath === '.' ||
    filePath === '..'
  ) {
    throw new Error(`Unsafe export file path: ${filePath}`)
  }
}
