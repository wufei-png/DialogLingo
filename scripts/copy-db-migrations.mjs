import fs from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '..')
const sourceDir = path.join(rootDir, 'src', 'main', 'db', 'migrations')
const targetDir = path.join(rootDir, 'dist-electron', 'main', 'db', 'migrations')

const migrationFiles = fs
  .readdirSync(sourceDir)
  .filter((file) => file.endsWith('.sql'))
  .sort()

fs.rmSync(targetDir, { recursive: true, force: true })
fs.mkdirSync(targetDir, { recursive: true })

for (const entry of migrationFiles) {
  fs.copyFileSync(path.join(sourceDir, entry), path.join(targetDir, entry))
}

console.log(`Copied database migrations to ${path.relative(rootDir, targetDir)}.`)
