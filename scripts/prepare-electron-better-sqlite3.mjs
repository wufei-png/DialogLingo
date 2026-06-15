import { copyFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

run(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
  'electron-rebuild',
  '-f',
  '-w',
  'better-sqlite3'
])

const releaseDir = path.resolve(
  'node_modules',
  'better-sqlite3',
  'build',
  'Release'
)
const sourceBinary = path.join(releaseDir, 'better_sqlite3.node')
const electronBinary = path.join(releaseDir, 'better_sqlite3.electron.node')
const nodeSnapshotBinary = path.join(releaseDir, 'better_sqlite3.node-runtime.node')

if (!existsSync(sourceBinary)) {
  console.error(`Electron build output not found at ${sourceBinary}`)
  process.exit(1)
}

if (!existsSync(nodeSnapshotBinary)) {
  console.error(`Node binding snapshot not found at ${nodeSnapshotBinary}`)
  process.exit(1)
}

copyFileSync(sourceBinary, electronBinary)
copyFileSync(nodeSnapshotBinary, sourceBinary)
