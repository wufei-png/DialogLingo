import { NAV_SECTIONS, type NavSectionId } from '../../../shared/navigation'

type Props = {
  activeSection: NavSectionId
  onChangeSection: (section: NavSectionId) => void
}

export function SectionTabs(props: Props) {
  return (
    <nav className="section-tabs" aria-label="Sections">
      {NAV_SECTIONS.map((section) => (
        <button
          key={section.id}
          className={`section-tab${props.activeSection === section.id ? ' is-active' : ''}`}
          type="button"
          onClick={() => props.onChangeSection(section.id)}
        >
          {section.label}
        </button>
      ))}
    </nav>
  )
}
