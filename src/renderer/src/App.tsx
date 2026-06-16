import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import type { NavSectionId } from '../../shared/navigation'
import { useLayoutSettings } from './app/useLayoutSettings'
import { SettingsSheet } from './components/SettingsSheet'
import { LaunchScanScreen } from './features/boot/LaunchScanScreen'
import { SearchPage } from './features/search/SearchPage'
import { WorkbookPage } from './features/workbook/WorkbookPage'
import { useLaunchScanGate } from './lib/useLaunchScanGate'

const queryClient = new QueryClient()

function AppSurface() {
  const [activeSection, setActiveSection] = useState<NavSectionId>('search')
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [activeWorkbookId, setActiveWorkbookId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const layoutSettings = useLayoutSettings()

  const sharedPageProps = {
    activeSection,
    onChangeSection: setActiveSection,
    splitRatio: layoutSettings.splitRatio,
    onSplitRatioChange: layoutSettings.setSplitRatio,
    onSplitRatioCommit: layoutSettings.saveSplitRatio,
    onOpenSettings: () => setSettingsOpen(true)
  }

  return (
    <div className="app-shell">
      <main className="app-content">
        {activeSection === 'search' ? (
          <SearchPage
            {...sharedPageProps}
            onWorkbookReady={(payload) => {
              setActiveJobId(payload.jobId)
              setActiveWorkbookId(payload.workbookId)
              setActiveSection('workbook')
            }}
          />
        ) : (
          <WorkbookPage
            {...sharedPageProps}
            jobId={activeJobId}
            workbookId={activeWorkbookId}
          />
        )}
      </main>
      <SettingsSheet
        open={settingsOpen}
        splitRatio={layoutSettings.splitRatio}
        onClose={() => setSettingsOpen(false)}
        onResetSplitRatio={layoutSettings.resetSplitRatio}
      />
    </div>
  )
}

export default function App() {
  const bootGate = useLaunchScanGate()

  if (bootGate.phase === 'loading') {
    return null
  }

  if (bootGate.phase === 'scanning') {
    return <LaunchScanScreen />
  }

  if (bootGate.phase === 'error') {
    return (
      <LaunchScanScreen
        errorMessage={bootGate.errorMessage}
        onContinue={bootGate.dismissError}
      />
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AppSurface />
    </QueryClientProvider>
  )
}
