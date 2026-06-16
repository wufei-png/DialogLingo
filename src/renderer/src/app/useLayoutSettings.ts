import { useCallback, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DEFAULT_SPLIT_RATIO,
  type Settings
} from '../../../shared/schemas/settings'
import { trpc } from '../lib/trpc'

const SETTINGS_QUERY_KEY = ['settings'] as const

export function useLayoutSettings() {
  const queryClient = useQueryClient()
  const [splitRatio, setSplitRatio] = useState(DEFAULT_SPLIT_RATIO)

  const settingsQuery = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: async () => (await trpc.settingsGet.query()) as Settings
  })

  useEffect(() => {
    if (settingsQuery.data?.ui.splitRatio != null) {
      setSplitRatio(settingsQuery.data.ui.splitRatio)
    }
  }, [settingsQuery.data?.ui.splitRatio])

  const saveSplitRatio = useCallback(
    async (nextRatio: number) => {
      setSplitRatio(nextRatio)

      const baseSettings =
        settingsQuery.data ?? ((await trpc.settingsGet.query()) as Settings)
      const nextSettings: Settings = {
        ...baseSettings,
        ui: {
          ...baseSettings.ui,
          splitRatio: nextRatio
        }
      }
      const saved = (await trpc.settingsSave.mutate(nextSettings)) as Settings
      queryClient.setQueryData(SETTINGS_QUERY_KEY, saved)
      setSplitRatio(saved.ui.splitRatio)
    },
    [queryClient, settingsQuery.data]
  )

  const resetSplitRatio = useCallback(
    () => saveSplitRatio(DEFAULT_SPLIT_RATIO),
    [saveSplitRatio]
  )

  return {
    splitRatio,
    setSplitRatio,
    saveSplitRatio,
    resetSplitRatio
  }
}
