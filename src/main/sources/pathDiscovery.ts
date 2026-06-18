import path from 'node:path'

function discoverClaudeDesktopCodeSessionRoot(home: string) {
  if (process.platform === 'darwin') {
    return path.join(
      home,
      'Library',
      'Application Support',
      'Claude',
      'claude-code-sessions'
    )
  }

  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'),
      'Claude',
      'claude-code-sessions'
    )
  }

  return path.join(home, '.config', 'Claude', 'claude-code-sessions')
}

export function discoverSourcePaths() {
  const home = process.env.HOME ?? ''

  return {
    codex: process.env.CODEX_HOME ?? path.join(home, '.codex'),
    claude: {
      cliRoot: process.env.CLAUDE_CONFIG_DIR ?? path.join(home, '.claude'),
      desktopCodeSessionRoot: discoverClaudeDesktopCodeSessionRoot(home)
    },
    opencode: path.join(home, '.local', 'share', 'opencode')
  }
}
