import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DEFAULT_SPLIT_RATIO,
  type Settings
} from '../../../shared/schemas/settings'
import { trpc } from '../lib/trpc'

type BackendKind = Settings['modelBackend']['kind']
type ExpressionDifficulty = Settings['generation']['expressionDifficulty']
type CliToolKey = 'codex' | 'claude' | 'opencode'

type Props = {
  open: boolean
  splitRatio: number
  onClose: () => void
  onResetSplitRatio: () => void
}

function formatRatio(value: number) {
  const left = Math.round(value * 100)
  const right = Math.round((1 - value) * 100)
  return `${left}:${right}`
}

function cliToolKeyForBackend(kind: BackendKind): CliToolKey | null {
  switch (kind) {
    case 'codex-cli':
      return 'codex'
    case 'claude-cli':
      return 'claude'
    case 'opencode-cli':
      return 'opencode'
    case 'openai-compatible':
      return null
  }
}

function cliToolLabel(tool: CliToolKey) {
  switch (tool) {
    case 'codex':
      return 'Codex CLI'
    case 'claude':
      return 'Claude CLI'
    case 'opencode':
      return 'OpenCode CLI'
  }
}

function toPositiveInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function SettingsSheet(props: Props) {
  const queryClient = useQueryClient()
  const settingsQuery = useQuery({
    enabled: props.open,
    queryKey: ['settings'],
    queryFn: async () => (await trpc.settingsGet.query()) as Settings
  })
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [defaultModel, setDefaultModel] = useState('')
  const [backendKind, setBackendKind] = useState<BackendKind>('openai-compatible')
  const [codexExecutablePath, setCodexExecutablePath] = useState('')
  const [codexModel, setCodexModel] = useState('')
  const [claudeExecutablePath, setClaudeExecutablePath] = useState('')
  const [claudeModel, setClaudeModel] = useState('')
  const [opencodeExecutablePath, setOpencodeExecutablePath] = useState('')
  const [opencodeModel, setOpencodeModel] = useState('')
  const [cliTimeoutMs, setCliTimeoutMs] = useState('120000')
  const [expressionDifficulty, setExpressionDifficulty] =
    useState<ExpressionDifficulty>('average')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!settingsQuery.data) {
      return
    }

    setBaseUrl(settingsQuery.data.provider.baseUrl)
    setApiKey(settingsQuery.data.provider.apiKey)
    setDefaultModel(settingsQuery.data.provider.defaultModel)
    setBackendKind(settingsQuery.data.modelBackend.kind)
    setCodexExecutablePath(settingsQuery.data.modelBackend.cli.codex.executablePath)
    setCodexModel(settingsQuery.data.modelBackend.cli.codex.model)
    setClaudeExecutablePath(settingsQuery.data.modelBackend.cli.claude.executablePath)
    setClaudeModel(settingsQuery.data.modelBackend.cli.claude.model)
    setOpencodeExecutablePath(settingsQuery.data.modelBackend.cli.opencode.executablePath)
    setOpencodeModel(settingsQuery.data.modelBackend.cli.opencode.model)
    setCliTimeoutMs(String(settingsQuery.data.modelBackend.cli.timeoutMs))
    setExpressionDifficulty(settingsQuery.data.generation.expressionDifficulty)
    setSaveMessage(null)
  }, [settingsQuery.data])

  if (!props.open) {
    return null
  }

  async function saveSettings() {
    const current = settingsQuery.data ?? ((await trpc.settingsGet.query()) as Settings)
    const next: Settings = {
      ...current,
      provider: {
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        defaultModel: defaultModel.trim()
      },
      modelBackend: {
        kind: backendKind,
        cli: {
          codex: {
            executablePath: codexExecutablePath.trim(),
            model: codexModel.trim()
          },
          claude: {
            executablePath: claudeExecutablePath.trim(),
            model: claudeModel.trim()
          },
          opencode: {
            executablePath: opencodeExecutablePath.trim(),
            model: opencodeModel.trim()
          },
          timeoutMs: toPositiveInt(cliTimeoutMs, current.modelBackend.cli.timeoutMs)
        }
      },
      generation: {
        ...current.generation,
        expressionDifficulty
      }
    }
    const saved = (await trpc.settingsSave.mutate(next)) as Settings
    queryClient.setQueryData(['settings'], saved)
    setSaveMessage('Saved.')
  }

  return (
    <div className="sheet-backdrop">
      <section className="sheet settings-sheet" role="dialog" aria-modal="true" aria-label="Settings">
        <header className="settings-sheet-header">
          <div>
            <p className="sheet-kicker">Settings</p>
            <h2>Settings</h2>
          </div>
          <button type="button" onClick={props.onClose}>
            Close
          </button>
        </header>
        <div className="settings-form">
          <label>
            <span>Backend</span>
            <select
              value={backendKind}
              onChange={(event) => setBackendKind(event.currentTarget.value as BackendKind)}
            >
              <option value="openai-compatible">OpenAI-compatible API</option>
              <option value="codex-cli">Codex CLI</option>
              <option value="claude-cli">Claude CLI</option>
              <option value="opencode-cli">OpenCode CLI</option>
            </select>
          </label>
          {backendKind === 'openai-compatible' ? (
            <>
              <label>
                <span>OpenAI-compatible base URL</span>
                <input
                  placeholder="https://api.openai.com or http://localhost:4000"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.currentTarget.value)}
                />
              </label>
              <label>
                <span>API key</span>
                <input
                  type="password"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(event) => setApiKey(event.currentTarget.value)}
                />
              </label>
              <label>
                <span>Default model</span>
                <input
                  placeholder="gpt-4o-mini"
                  value={defaultModel}
                  onChange={(event) => setDefaultModel(event.currentTarget.value)}
                />
              </label>
            </>
          ) : null}
          {cliToolKeyForBackend(backendKind) ? (
            <CliSettingsFields
              tool={cliToolKeyForBackend(backendKind)}
              codexExecutablePath={codexExecutablePath}
              codexModel={codexModel}
              claudeExecutablePath={claudeExecutablePath}
              claudeModel={claudeModel}
              opencodeExecutablePath={opencodeExecutablePath}
              opencodeModel={opencodeModel}
              cliTimeoutMs={cliTimeoutMs}
              onCodexExecutablePathChange={setCodexExecutablePath}
              onCodexModelChange={setCodexModel}
              onClaudeExecutablePathChange={setClaudeExecutablePath}
              onClaudeModelChange={setClaudeModel}
              onOpencodeExecutablePathChange={setOpencodeExecutablePath}
              onOpencodeModelChange={setOpencodeModel}
              onCliTimeoutMsChange={setCliTimeoutMs}
            />
          ) : null}
          <p className="settings-help">
            LiteLLM works as a local OpenAI-compatible endpoint; use the API backend with a LiteLLM base URL.
          </p>
          <h3 className="settings-section-heading">Generation</h3>
          <label>
            <span>Expression difficulty</span>
            <select
              value={expressionDifficulty}
              onChange={(event) =>
                setExpressionDifficulty(event.currentTarget.value as ExpressionDifficulty)
              }
            >
              <option value="easy">Easy</option>
              <option value="average">Average</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <button type="button" onClick={() => void saveSettings()}>
            Save Settings
          </button>
          {saveMessage ? <p className="settings-save-message">{saveMessage}</p> : null}
        </div>
        <h3 className="settings-section-heading">Layout</h3>
        <div className="settings-row">
          <span>Pane width</span>
          <strong>{formatRatio(props.splitRatio)}</strong>
        </div>
        <button type="button" onClick={props.onResetSplitRatio}>
          Reset to {formatRatio(DEFAULT_SPLIT_RATIO)}
        </button>
      </section>
    </div>
  )
}

function CliSettingsFields(props: {
  tool: CliToolKey | null
  codexExecutablePath: string
  codexModel: string
  claudeExecutablePath: string
  claudeModel: string
  opencodeExecutablePath: string
  opencodeModel: string
  cliTimeoutMs: string
  onCodexExecutablePathChange: (value: string) => void
  onCodexModelChange: (value: string) => void
  onClaudeExecutablePathChange: (value: string) => void
  onClaudeModelChange: (value: string) => void
  onOpencodeExecutablePathChange: (value: string) => void
  onOpencodeModelChange: (value: string) => void
  onCliTimeoutMsChange: (value: string) => void
}) {
  if (!props.tool) {
    return null
  }

  const executablePath =
    props.tool === 'codex'
      ? props.codexExecutablePath
      : props.tool === 'claude'
        ? props.claudeExecutablePath
        : props.opencodeExecutablePath
  const model =
    props.tool === 'codex'
      ? props.codexModel
      : props.tool === 'claude'
        ? props.claudeModel
        : props.opencodeModel
  const onExecutablePathChange =
    props.tool === 'codex'
      ? props.onCodexExecutablePathChange
      : props.tool === 'claude'
        ? props.onClaudeExecutablePathChange
        : props.onOpencodeExecutablePathChange
  const onModelChange =
    props.tool === 'codex'
      ? props.onCodexModelChange
      : props.tool === 'claude'
        ? props.onClaudeModelChange
        : props.onOpencodeModelChange

  return (
    <>
      <label>
        <span>{cliToolLabel(props.tool)} executable path</span>
        <input
          placeholder={props.tool}
          value={executablePath}
          onChange={(event) => onExecutablePathChange(event.currentTarget.value)}
        />
      </label>
      <p className="settings-help">
        Leave blank to discover <code>{props.tool}</code> from PATH.
      </p>
      <label>
        <span>{cliToolLabel(props.tool)} model</span>
        <input
          placeholder="Use CLI default"
          value={model}
          onChange={(event) => onModelChange(event.currentTarget.value)}
        />
      </label>
      <label>
        <span>CLI timeout</span>
        <input
          type="number"
          min="1000"
          step="1000"
          value={props.cliTimeoutMs}
          onChange={(event) => props.onCliTimeoutMsChange(event.currentTarget.value)}
        />
      </label>
    </>
  )
}
