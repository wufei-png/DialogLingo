export const NAV_SECTIONS = [
  { id: 'search', label: 'Search & Select' },
  { id: 'workbook', label: 'Workbook' }
] as const

export type NavSectionId = (typeof NAV_SECTIONS)[number]['id']
