import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { NAV_SECTIONS, type NavSectionId } from '../../shared/navigation'
import { SearchPage } from './features/search/SearchPage'
import { WorkbookPage } from './features/workbook/WorkbookPage'

const queryClient = new QueryClient()

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSectionId>('search')
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [activeWorkbookId, setActiveWorkbookId] = useState<string | null>(null)

  return (
    <QueryClientProvider client={queryClient}>
      <div className="app-shell">
        <aside className="section-switcher">
          <div className="brand-block">
            <span className="brand-kicker">DialogLingo</span>
            <h1 className="brand-title">Local chat to workbook</h1>
          </div>
          <div className="section-list">
            {NAV_SECTIONS.map((section) => (
              <button
                key={section.id}
                className={`section-button${activeSection === section.id ? ' is-active' : ''}`}
                type="button"
                onClick={() => setActiveSection(section.id)}
              >
                {section.label}
              </button>
            ))}
          </div>
        </aside>
        <main className="app-content">
          {activeSection === 'search' ? (
            <SearchPage
              onWorkbookReady={(payload) => {
                setActiveJobId(payload.jobId)
                setActiveWorkbookId(payload.workbookId)
                setActiveSection('workbook')
              }}
            />
          ) : (
            <WorkbookPage
              jobId={activeJobId}
              workbookId={activeWorkbookId}
            />
          )}
        </main>
      </div>
    </QueryClientProvider>
  )
}
