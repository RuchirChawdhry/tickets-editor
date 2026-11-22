/** App-wide, explicit theme preference. Missing or corrupt values always mean dark. */
export type AppTheme = 'dark' | 'light'

export const APP_THEME_KEY = 'tickets-editor.theme.v1'

export function normalizeTheme(value: unknown): AppTheme {
  return value === 'light' ? 'light' : 'dark'
}

export function loadTheme(storage: Pick<Storage, 'getItem'>): AppTheme {
  try {
    return normalizeTheme(storage.getItem(APP_THEME_KEY))
  } catch {
    return 'dark'
  }
}

export function saveTheme(
  storage: Pick<Storage, 'setItem'>,
  theme: AppTheme,
): boolean {
  try {
    storage.setItem(APP_THEME_KEY, theme)
    return true
  } catch {
    return false
  }
}
