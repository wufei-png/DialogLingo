import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DEFAULT_SPLIT_RATIO,
  type Settings
} from '../../../shared/schemas/settings'
import { trpc } from '../lib/trpc'

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
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!settingsQuery.data) {
      return
    }

    setBaseUrl(settingsQuery.data.provider.baseUrl)
    setApiKey(settingsQuery.data.provider.apiKey)
    setDefaultModel(settingsQuery.data.provider.defaultModel)
    setSaveMessage(null)
  }, [settingsQuery.data])

  if (!props.open) {
    return null
  }

  async function saveProviderSettings() {
    const current = settingsQuery.data ?? ((await trpc.settingsGet.query()) as Settings)
    const next: Settings = {
      ...current,
      provider: {
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        defaultModel: defaultModel.trim()
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
            <h2>Provider</h2>
          </div>
          <button type="button" onClick={props.onClose}>
            Close
          </button>
        </header>
        <div className="settings-form">
          <label>
            <span>LiteLLM base URL</span>
            <input
              placeholder="http://localhost:4000"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.currentTarget.value)}
            />
          </label>
          <label>
            <span>LiteLLM API key</span>
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
          <button type="button" onClick={() => void saveProviderSettings()}>
            Save Provider
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
