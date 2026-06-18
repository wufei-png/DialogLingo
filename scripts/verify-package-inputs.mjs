import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const rootDir = path.resolve(import.meta.dirname, '..')
const betterSqlitePackageDir = path.dirname(
  require.resolve('better-sqlite3/package.json')
)

const requiredFiles = [
  path.join(rootDir, 'dist-electron', 'main', 'index.js'),
  path.join(
    rootDir,
    'dist-electron',
    'main',
    'db',
    'migrations',
    '0000_initial.sql'
  ),
  path.join(
    rootDir,
    'dist-electron',
    'main',
    'db',
    'migrations',
    '0001_session_fts.sql'
  ),
  path.join(
    rootDir,
    'dist-electron',
    'main',
    'db',
    'migrations',
    '0002_session_search_trigram.sql'
  ),
  path.join(rootDir, 'dist-electron', 'preload', 'index.js'),
  path.join(rootDir, 'dist-electron', 'renderer', 'index.html'),
  path.join(
    betterSqlitePackageDir,
    'build',
    'Release',
    'better_sqlite3.electron.node'
  )
]

const missingFiles = requiredFiles.filter((filePath) => !existsSync(filePath))

if (missingFiles.length > 0) {
  console.error('Package inputs are missing:')
  for (const filePath of missingFiles) {
    console.error(`- ${path.relative(rootDir, filePath)}`)
  }
  process.exit(1)
}

console.log('Package inputs verified.')
