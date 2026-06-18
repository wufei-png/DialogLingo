import { createClaudeAdapter, type ClaudeAdapterPaths } from './claude/adapter'
import { createCodexAdapter } from './codex/adapter'
import { createOpenCodeAdapter } from './opencode/adapter'
import { discoverSourcePaths } from './pathDiscovery'
import type { SourceRegistry } from './types'

export type SourceRegistryPaths = {
  codex: string
  claude: string | ClaudeAdapterPaths
  opencode: string
}

export function createSourceRegistry(
  paths: SourceRegistryPaths = discoverSourcePaths()
): SourceRegistry {
  return {
    codex: createCodexAdapter(paths.codex),
    claude: createClaudeAdapter(paths.claude),
    opencode: createOpenCodeAdapter(paths.opencode)
  }
}
