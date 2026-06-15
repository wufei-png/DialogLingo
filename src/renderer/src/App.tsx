import { NAV_SECTIONS } from '../../shared/navigation'

export default function App() {
  return (
    <div className="app-shell">
      <aside className="section-switcher">
        <div className="brand-block">
          <span className="brand-kicker">DialogLingo</span>
          <h1 className="brand-title">Local chat to workbook</h1>
        </div>
        <div className="section-list">
          {NAV_SECTIONS.map((section) => (
            <button key={section.id} className="section-button" type="button">
              {section.label}
            </button>
          ))}
        </div>
      </aside>
      <main className="boot-message">
        <section className="boot-card">
          <p className="boot-eyebrow">Bootstrap</p>
          <h2>DialogLingo shell is ready for source, search, and workbook flows.</h2>
        </section>
      </main>
    </div>
  )
}
