export const NAV_SECTIONS = [
  { id: 'search' },
  { id: 'workbook' }
] as const

export type NavSectionId = (typeof NAV_SECTIONS)[number]['id']
