import { ScriptOnce } from "@tanstack/react-router"
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react"
import type { ReactNode } from "react"

export type Theme = "dark" | "light" | "system"
export type ResolvedTheme = Exclude<Theme, "system">

type ThemeProviderProps = {
  children: ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  resolvedTheme: ResolvedTheme
  theme: Theme
  setTheme: (theme: Theme) => void
}

const defaultThemeStorageKey = "theme"

function normalizeThemeStorageKey(storageKey: string) {
  return /^[\w:.-]{1,80}$/.test(storageKey)
    ? storageKey
    : defaultThemeStorageKey
}

function getThemeScript(storageKey: string, defaultTheme: Theme) {
  const key = JSON.stringify(normalizeThemeStorageKey(storageKey))
  const fallback = JSON.stringify(defaultTheme)

  return `(function(){try{var t=localStorage.getItem(${key});if(t!=='light'&&t!=='dark'&&t!=='system'){t=${fallback}}var d=matchMedia('(prefers-color-scheme: dark)').matches;var r=t==='system'?(d?'dark':'light'):t;var e=document.documentElement;e.classList.add(r);e.style.colorScheme=r}catch(e){}})();`
}

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(
  undefined
)

function applyResolvedTheme(resolved: ResolvedTheme) {
  const root = document.documentElement
  root.classList.remove("light", "dark")
  root.classList.add(resolved)
  root.style.colorScheme = resolved
}

function subscribeToSystemTheme(onStoreChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)")
  media.addEventListener("change", onStoreChange)

  return () => media.removeEventListener("change", onStoreChange)
}

function getSystemThemeSnapshot(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

function getStoredTheme(storageKey: string, defaultTheme: Theme) {
  if (typeof window === "undefined") {
    return defaultTheme
  }

  const stored = localStorage.getItem(storageKey)

  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : defaultTheme
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = defaultThemeStorageKey,
}: ThemeProviderProps) {
  const themeStorageKey = normalizeThemeStorageKey(storageKey)
  const [theme, setThemeState] = useState<Theme>(() =>
    getStoredTheme(themeStorageKey, defaultTheme)
  )
  const systemTheme = useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemThemeSnapshot,
    () => "light" as const
  )
  const resolvedTheme = theme === "system" ? systemTheme : theme

  useEffect(() => {
    applyResolvedTheme(resolvedTheme)
  }, [resolvedTheme])

  const setTheme = useCallback(
    (nextTheme: Theme) => {
      localStorage.setItem(themeStorageKey, nextTheme)
      setThemeState(nextTheme)
    },
    [themeStorageKey]
  )
  const value = useMemo(
    () => ({ resolvedTheme, setTheme, theme }),
    [resolvedTheme, setTheme, theme]
  )

  return (
    <ThemeProviderContext.Provider value={value}>
      <ScriptOnce>{getThemeScript(themeStorageKey, defaultTheme)}</ScriptOnce>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export function useTheme() {
  const context = use(ThemeProviderContext)

  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }

  return context
}
