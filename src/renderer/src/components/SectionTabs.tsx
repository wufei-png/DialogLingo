import { BookOpen, ListFilter, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NAV_SECTIONS, type NavSectionId } from '../../../shared/navigation'
import { IconLabel } from './IconLabel'

type Props = {
  activeSection: NavSectionId
  onChangeSection: (section: NavSectionId) => void
}

export function SectionTabs(props: Props) {
  const { t } = useTranslation()
  const sectionIcons: Record<NavSectionId, LucideIcon> = {
    search: ListFilter,
    workbook: BookOpen
  }

  return (
    <nav className="section-tabs" aria-label={t('navigation.sections')}>
      {NAV_SECTIONS.map((section) => (
        <button
          key={section.id}
          className={`section-tab${props.activeSection === section.id ? ' is-active' : ''}`}
          type="button"
          onClick={() => props.onChangeSection(section.id)}
        >
          <IconLabel icon={sectionIcons[section.id]}>
            {t(`navigation.${section.id}`)}
          </IconLabel>
        </button>
      ))}
    </nav>
  )
}
