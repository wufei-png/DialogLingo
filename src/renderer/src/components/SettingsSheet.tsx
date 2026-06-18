import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ScanSearch,
  Settings as SettingsIcon,
  Shield,
  SlidersHorizontal,
  Sparkles,
  X
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AppLocale, Settings } from '../../../shared/schemas/settings'
import { IconLabel } from './IconLabel'
import appI18n from '../i18n/i18n'
import { trpc } from '../lib/trpc'
import { useEscapeToClose } from '../lib/useEscapeToClose'

type BackendKind = Settings['modelBackend']['kind']
type ExpressionDifficulty = Settings['generation']['expressionDifficulty']
type FlaggedItemExportPolicy = Settings['privacy']['flaggedItemExportPolicy']
type CliToolKey = 'codex' | 'claude' | 'opencode'

type Props = {
  open: boolean
  onClose: () => void
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

function toNonNegativeNumber(value: string, fallback: number) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function toPercent(value: number) {
  return String(Math.round(value * 100))
}

function toPercentInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.min(100, Math.max(0, parsed))
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function SettingsSheet(props: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  useEscapeToClose(props.open, props.onClose)
  const settingsQuery = useQuery({
    enabled: props.open,
    queryKey: ['settings'],
    queryFn: async () => (await trpc.settingsGet.query()) as Settings
  })
  const [locale, setLocale] = useState<AppLocale>('en')
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
  const [batchSize, setBatchSize] = useState('32')
  const [maxItemsPerSession, setMaxItemsPerSession] = useState('50')
  const [expressionTargetPercent, setExpressionTargetPercent] = useState('60')
  const [balanceStrength, setBalanceStrength] = useState('0.1')
  const [scanOnLaunch, setScanOnLaunch] = useState(true)
  const [includeArchivedSessions, setIncludeArchivedSessions] = useState(false)
  const [flaggedItemExportPolicy, setFlaggedItemExportPolicy] =
    useState<FlaggedItemExportPolicy>('warn')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!settingsQuery.data) {
      return
    }

    setBaseUrl(settingsQuery.data.provider.baseUrl)
    setLocale(settingsQuery.data.ui.locale)
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
    setBatchSize(String(settingsQuery.data.generation.batchSize))
    setMaxItemsPerSession(String(settingsQuery.data.generation.maxItemsPerSession))
    setExpressionTargetPercent(
      toPercent(settingsQuery.data.generation.typeBalanceProfile.targetExpression)
    )
    setBalanceStrength(String(settingsQuery.data.generation.typeBalanceProfile.lambda))
    setScanOnLaunch(settingsQuery.data.scan.scanOnLaunch)
    setIncludeArchivedSessions(settingsQuery.data.scan.includeArchivedSessions)
    setFlaggedItemExportPolicy(settingsQuery.data.privacy.flaggedItemExportPolicy)
    setSaveMessage(null)
  }, [settingsQuery.data])

  if (!props.open) {
    return null
  }

  async function saveSettings() {
    const current = settingsQuery.data ?? ((await trpc.settingsGet.query()) as Settings)
    const includeArchivedChanged =
      current.scan.includeArchivedSessions !== includeArchivedSessions
    const nextExpressionTarget = toPercentInt(expressionTargetPercent, 60) / 100
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
        expressionDifficulty,
        batchSize: toPositiveInt(batchSize, current.generation.batchSize),
        maxItemsPerSession: toPositiveInt(
          maxItemsPerSession,
          current.generation.maxItemsPerSession
        ),
        typeBalanceProfile: {
          targetExpression: nextExpressionTarget,
          targetSentence: 1 - nextExpressionTarget,
          lambda: toNonNegativeNumber(
            balanceStrength,
            current.generation.typeBalanceProfile.lambda
          )
        }
      },
      privacy: {
        ...current.privacy,
        flaggedItemExportPolicy
      },
      scan: {
        ...current.scan,
        scanOnLaunch,
        includeArchivedSessions
      },
      ui: {
        ...current.ui,
        locale
      }
    }
    const saved = (await trpc.settingsSave.mutate(next)) as Settings
    queryClient.setQueryData(['settings'], saved)
    await appI18n.changeLanguage(saved.ui.locale)
    if (!includeArchivedChanged) {
      setSaveMessage(appI18n.t('settings.messages.saved'))
      return
    }

    setSaveMessage(appI18n.t('settings.messages.savedRescanning'))
    try {
      await trpc.sessionRescan.mutate()
      setSaveMessage(appI18n.t('settings.messages.savedAndRescanned'))
    } catch (error) {
      setSaveMessage(
        appI18n.t('settings.messages.savedRescanFailed', {
          message: getErrorMessage(error)
        })
      )
    }
  }

  async function resetAllSettings() {
    const saved = (await trpc.settingsReset.mutate()) as Settings
    queryClient.setQueryData(['settings'], saved)
    await appI18n.changeLanguage(saved.ui.locale)
    setSaveMessage(appI18n.t('settings.messages.reset'))
  }

  return (
    <div className="sheet-backdrop">
      <section className="sheet settings-sheet" role="dialog" aria-modal="true" aria-label={t('settings.title')}>
        <header className="settings-sheet-header">
          <div>
            <p className="sheet-kicker">{t('settings.title')}</p>
            <h2>
              <IconLabel icon={SettingsIcon}>{t('settings.title')}</IconLabel>
            </h2>
          </div>
          <button type="button" onClick={props.onClose}>
            <IconLabel icon={X}>{t('common.close')}</IconLabel>
          </button>
        </header>
        <div className="settings-form">
          <h3 className="settings-section-heading">
            <IconLabel icon={SlidersHorizontal}>{t('settings.interface')}</IconLabel>
          </h3>
          <label>
            <span>{t('settings.language')}</span>
            <select
              value={locale}
              onChange={(event) => setLocale(event.currentTarget.value as AppLocale)}
            >
              <option value="en">{t('settings.languageEnglish')}</option>
              <option value="zh-CN">{t('settings.languageChinese')}</option>
            </select>
          </label>
          <label>
            <span>{t('settings.backend')}</span>
            <select
              value={backendKind}
              onChange={(event) => setBackendKind(event.currentTarget.value as BackendKind)}
            >
              <option value="openai-compatible">{t('settings.backendOpenAiCompatible')}</option>
              <option value="codex-cli">Codex CLI</option>
              <option value="claude-cli">Claude CLI</option>
              <option value="opencode-cli">OpenCode CLI</option>
            </select>
          </label>
          {backendKind === 'openai-compatible' ? (
            <>
              <label>
                <span>{t('settings.openAiBaseUrl')}</span>
                <input
                  placeholder="https://api.openai.com or http://localhost:4000"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.currentTarget.value)}
                />
              </label>
              <label>
                <span>{t('settings.apiKey')}</span>
                <input
                  type="password"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(event) => setApiKey(event.currentTarget.value)}
                />
              </label>
              <label>
                <span>{t('settings.defaultModel')}</span>
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
            {t('settings.liteLlmHelp')}
          </p>
          <h3 className="settings-section-heading">
            <IconLabel icon={Sparkles}>{t('settings.generation')}</IconLabel>
          </h3>
          <label>
            <span>{t('settings.expressionDifficulty')}</span>
            <select
              value={expressionDifficulty}
              onChange={(event) =>
                setExpressionDifficulty(event.currentTarget.value as ExpressionDifficulty)
              }
            >
              <option value="easy">{t('settings.difficultyEasy')}</option>
              <option value="average">{t('settings.difficultyAverage')}</option>
              <option value="hard">{t('settings.difficultyHard')}</option>
            </select>
          </label>
          <label>
            <span className="settings-label-row">
              <span>{t('settings.llmBatchSize')}</span>
              <button
                type="button"
                className="settings-help-trigger"
                aria-label={t('settings.llmBatchSizeQuestion')}
                data-tooltip={t('settings.llmBatchSizeHelp')}
              >
                ?
              </button>
            </span>
            <input
              type="number"
              min="1"
              step="1"
              value={batchSize}
              onChange={(event) => setBatchSize(event.currentTarget.value)}
            />
          </label>
          <label>
            <span>{t('settings.maxItemsPerSession')}</span>
            <input
              type="number"
              min="1"
              step="1"
              value={maxItemsPerSession}
              onChange={(event) => setMaxItemsPerSession(event.currentTarget.value)}
            />
          </label>
          <label>
            <span className="settings-label-row">
              <span>{t('settings.expressionTarget', { percent: expressionTargetPercent })}</span>
              <button
                type="button"
                className="settings-help-trigger"
                aria-label={t('settings.expressionTargetQuestion')}
                data-tooltip={t('settings.expressionTargetHelp', {
                  sentencePercent: 100 - toPercentInt(expressionTargetPercent, 60)
                })}
              >
                ?
              </button>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={expressionTargetPercent}
              onChange={(event) => setExpressionTargetPercent(event.currentTarget.value)}
            />
          </label>
          <label>
            <span className="settings-label-row">
              <span>{t('settings.balanceStrength')}</span>
              <button
                type="button"
                className="settings-help-trigger"
                aria-label={t('settings.balanceStrengthQuestion')}
                data-tooltip={t('settings.balanceStrengthHelp')}
              >
                ?
              </button>
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={balanceStrength}
              onChange={(event) => setBalanceStrength(event.currentTarget.value)}
            />
          </label>
          <h3 className="settings-section-heading">
            <IconLabel icon={Shield}>{t('settings.privacy')}</IconLabel>
          </h3>
          <label>
            <span>{t('settings.flaggedItemExportPolicy')}</span>
            <select
              value={flaggedItemExportPolicy}
              onChange={(event) =>
                setFlaggedItemExportPolicy(
                  event.currentTarget.value as FlaggedItemExportPolicy
                )
              }
            >
              <option value="warn">{t('settings.warnAndRequireKeep')}</option>
              <option value="block">{t('settings.blockFlaggedItems')}</option>
            </select>
          </label>
          <h3 className="settings-section-heading">
            <IconLabel icon={ScanSearch}>{t('settings.scan')}</IconLabel>
          </h3>
          <label className="settings-toggle-row">
            <span>{t('settings.scanOnLaunch')}</span>
            <span className="settings-switch-control">
              <input
                className="settings-switch-input"
                type="checkbox"
                checked={scanOnLaunch}
                onChange={(event) => setScanOnLaunch(event.currentTarget.checked)}
              />
              <span className="settings-switch" aria-hidden="true" />
            </span>
          </label>
          <label className="settings-toggle-row">
            <span>{t('settings.includeArchivedSessions')}</span>
            <span className="settings-switch-control">
              <input
                className="settings-switch-input"
                type="checkbox"
                checked={includeArchivedSessions}
                onChange={(event) => setIncludeArchivedSessions(event.currentTarget.checked)}
              />
              <span className="settings-switch" aria-hidden="true" />
            </span>
          </label>
          <div className="settings-actions">
            <button type="button" onClick={() => void saveSettings()}>
              {t('settings.saveSettings')}
            </button>
            <button type="button" className="settings-reset-button" onClick={() => void resetAllSettings()}>
              {t('settings.resetAllToDefaults')}
            </button>
          </div>
          {saveMessage ? <p className="settings-save-message">{saveMessage}</p> : null}
        </div>
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
  const { t } = useTranslation()

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
        <span>{t('settings.cliExecutablePath', { tool: cliToolLabel(props.tool) })}</span>
        <input
          placeholder={props.tool}
          value={executablePath}
          onChange={(event) => onExecutablePathChange(event.currentTarget.value)}
        />
      </label>
      <p className="settings-help">
        {t('settings.cliPathHelp', { tool: props.tool })}
      </p>
      <label>
        <span>{t('settings.cliModel', { tool: cliToolLabel(props.tool) })}</span>
        <input
          placeholder={t('settings.cliDefaultPlaceholder')}
          value={model}
          onChange={(event) => onModelChange(event.currentTarget.value)}
        />
      </label>
      <label>
        <span>{t('settings.cliTimeout')}</span>
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
