import { createContext, useContext } from 'react'

export type ThemeChrome = 'dark' | 'light'

export const ThemeChromeContext = createContext<ThemeChrome>('dark')

export function useThemeChrome() {
  return useContext(ThemeChromeContext)
}
