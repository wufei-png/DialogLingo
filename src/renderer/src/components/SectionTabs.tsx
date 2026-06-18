import { useTranslation } from 'react-i18next'
import { NAV_SECTIONS, type NavSectionId } from '../../../shared/navigation'

type Props = {
  activeSection: NavSectionId
  onChangeSection: (section: NavSectionId) => void
}

export function SectionTabs(props: Props) {
  const { t } = useTranslation()

  return (
    <nav className="section-tabs" aria-label={t('navigation.sections')}>
      {NAV_SECTIONS.map((section) => (
        <button
          key={section.id}
          className={`section-tab${props.activeSection === section.id ? ' is-active' : ''}`}
          type="button"
          onClick={() => props.onChangeSection(section.id)}
        >
          {t(`navigation.${section.id}`)}
        </button>
      ))}
    </nav>
  )
}
