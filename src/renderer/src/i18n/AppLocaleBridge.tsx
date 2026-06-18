import { useEffect, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Settings } from '../../../shared/schemas/settings'
import { trpc } from '../lib/trpc'
import i18n from './i18n'

export function AppLocaleBridge(props: { children: ReactNode }) {
  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await trpc.settingsGet.query()) as Settings
  })
  const locale = settingsQuery.data?.ui.locale

  useEffect(() => {
    if (!locale || i18n.language === locale) {
      return
    }

    void i18n.changeLanguage(locale)
  }, [locale])

  return <>{props.children}</>
}
