import { copyFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const releaseDir = path.resolve(
  'node_modules',
  'better-sqlite3',
  'build',
  'Release'
)
const sourceBinary = path.join(releaseDir, 'better_sqlite3.node')
const snapshotBinary = path.join(releaseDir, 'better_sqlite3.node-runtime.node')

if (!existsSync(sourceBinary)) {
  console.error(`Node binding not found at ${sourceBinary}`)
  process.exit(1)
}

copyFileSync(sourceBinary, snapshotBinary)
