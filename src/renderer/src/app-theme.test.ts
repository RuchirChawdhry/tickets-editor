import { describe, expect, it, vi } from 'vitest'
import { APP_THEME_KEY, loadTheme, normalizeTheme, saveTheme } from './app-theme'

describe('application themes', () => {
  it('defaults to dark, regardless of the system theme', () => {
    expect(normalizeTheme(null)).toBe('dark')
    expect(normalizeTheme('system')).toBe('dark')
    expect(normalizeTheme('not-a-theme')).toBe('dark')
    expect(loadTheme({ getItem: () => null })).toBe('dark')
  })

  it('loads an explicitly saved light preference', () => {
    expect(loadTheme({ getItem: key => key === APP_THEME_KEY ? 'light' : null })).toBe('light')
  })

  it('persists the selected theme and handles storage failures', () => {
    const setItem = vi.fn()
    expect(saveTheme({ setItem }, 'light')).toBe(true)
    expect(setItem).toHaveBeenCalledWith(APP_THEME_KEY, 'light')
    expect(loadTheme({ getItem: () => { throw new Error('blocked') } })).toBe('dark')
    expect(saveTheme({ setItem: () => { throw new Error('blocked') } }, 'dark')).toBe(false)
  })
})
