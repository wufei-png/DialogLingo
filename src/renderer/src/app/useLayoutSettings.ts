import { useCallback, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DEFAULT_SPLIT_RATIO,
  DEFAULT_WORKBOOK_SPLIT_RATIO,
  type Settings
} from '../../../shared/schemas/settings'
import { trpc } from '../lib/trpc'

const SETTINGS_QUERY_KEY = ['settings'] as const

export function useLayoutSettings() {
  const queryClient = useQueryClient()
  const [splitRatio, setSplitRatio] = useState(DEFAULT_SPLIT_RATIO)
  const [workbookSplitRatio, setWorkbookSplitRatio] = useState(DEFAULT_WORKBOOK_SPLIT_RATIO)
  const [workbookSourcePinned, setWorkbookSourcePinned] = useState(false)

  const settingsQuery = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: async () => (await trpc.settingsGet.query()) as Settings
  })

  useEffect(() => {
    if (settingsQuery.data?.ui.splitRatio != null) {
      setSplitRatio(settingsQuery.data.ui.splitRatio)
    }
    if (settingsQuery.data?.ui.workbookSplitRatio != null) {
      setWorkbookSplitRatio(settingsQuery.data.ui.workbookSplitRatio)
    }
    if (settingsQuery.data?.ui.workbookSourcePinned != null) {
      setWorkbookSourcePinned(settingsQuery.data.ui.workbookSourcePinned)
    }
  }, [
    settingsQuery.data?.ui.splitRatio,
    settingsQuery.data?.ui.workbookSplitRatio,
    settingsQuery.data?.ui.workbookSourcePinned
  ])

  const saveSplitRatio = useCallback(
    async (nextRatio: number) => {
      setSplitRatio(nextRatio)

      const baseSettings = (await trpc.settingsGet.query()) as Settings
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

  const saveWorkbookSplitRatio = useCallback(
    async (nextRatio: number) => {
      setWorkbookSplitRatio(nextRatio)

      const baseSettings = (await trpc.settingsGet.query()) as Settings
      const nextSettings: Settings = {
        ...baseSettings,
        ui: {
          ...baseSettings.ui,
          workbookSplitRatio: nextRatio
        }
      }
      const saved = (await trpc.settingsSave.mutate(nextSettings)) as Settings
      queryClient.setQueryData(SETTINGS_QUERY_KEY, saved)
      setWorkbookSplitRatio(saved.ui.workbookSplitRatio)
      setWorkbookSourcePinned(saved.ui.workbookSourcePinned)
    },
    [queryClient, settingsQuery.data]
  )

  const saveWorkbookSourcePinned = useCallback(
    async (nextPinned: boolean) => {
      setWorkbookSourcePinned(nextPinned)

      const baseSettings = (await trpc.settingsGet.query()) as Settings
      const nextSettings: Settings = {
        ...baseSettings,
        ui: {
          ...baseSettings.ui,
          workbookSourcePinned: nextPinned
        }
      }
      const saved = (await trpc.settingsSave.mutate(nextSettings)) as Settings
      queryClient.setQueryData(SETTINGS_QUERY_KEY, saved)
      setWorkbookSplitRatio(saved.ui.workbookSplitRatio)
      setWorkbookSourcePinned(saved.ui.workbookSourcePinned)
    },
    [queryClient, settingsQuery.data]
  )

  return {
    splitRatio,
    workbookSplitRatio,
    workbookSourcePinned,
    setSplitRatio,
    setWorkbookSplitRatio,
    setWorkbookSourcePinned,
    saveSplitRatio,
    saveWorkbookSplitRatio,
    saveWorkbookSourcePinned
  }
}
