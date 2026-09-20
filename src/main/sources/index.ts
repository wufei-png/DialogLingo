import { createClaudeAdapter, type ClaudeAdapterPaths } from './claude/adapter'
import { createCodexAdapter } from './codex/adapter'
import { createOpenCodeAdapter } from './opencode/adapter'
import { discoverSourcePaths } from './pathDiscovery'
import type { SourceAdapterOptions, SourceRegistry } from './types'

export type SourceRegistryPaths = {
  codex: string
  claude: string | ClaudeAdapterPaths
  opencode: string
}

export function createSourceRegistry(
  paths: SourceRegistryPaths = discoverSourcePaths(),
  options?: SourceAdapterOptions
): SourceRegistry {
  return {
    codex: createCodexAdapter(paths.codex, options),
    claude: createClaudeAdapter(paths.claude, options),
    opencode: createOpenCodeAdapter(paths.opencode, options)
  }
}
