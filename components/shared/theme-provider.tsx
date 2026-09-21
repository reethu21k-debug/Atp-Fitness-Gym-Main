'use client';

import * as React from 'react';

type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'atp-fitness-theme';
const isTheme = (v: unknown): v is Theme => v === 'light' || v === 'dark' || v === 'system';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

/**
 * Props mirror the next-themes API so `app/layout.tsx` can pass
 * `attribute` / `defaultTheme` / `enableSystem` without a type error. This is a
 * hand-rolled provider (it writes the `dark` class directly), so only
 * `defaultTheme` and `forcedTheme` are actually honoured; the others are accepted
 * for drop-in compatibility.
 *
 * `forcedTheme` locks the whole app to one theme: anything saved in localStorage is
 * ignored (and overwritten), and `setTheme()` becomes a no-op.
 */
export interface ThemeProviderProps {
  children: React.ReactNode;
  attribute?: string;
  defaultTheme?: Theme;
  forcedTheme?: Theme;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
  storageKey?: string;
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  forcedTheme,
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(forcedTheme ?? defaultTheme);
  const [resolvedTheme, setResolvedTheme] = React.useState<'light' | 'dark'>('light');

  // Sync with what was saved earlier (skipped entirely when the theme is forced)
  React.useEffect(() => {
    if (forcedTheme) return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isTheme(stored)) setThemeState(stored);
    } catch {}
  }, [forcedTheme]);

  const activeTheme: Theme = forcedTheme ?? theme;

  // Apply theme whenever it changes
  React.useEffect(() => {
    const root = document.documentElement;

    const apply = (t: Theme) => {
      const isDark =
        t === 'dark' ||
        (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      root.classList.toggle('dark', isDark);
      root.classList.toggle('light', !isDark);
      root.style.colorScheme = isDark ? 'dark' : 'light';
      setResolvedTheme(isDark ? 'dark' : 'light');
    };

    apply(activeTheme);
    try {
      localStorage.setItem(STORAGE_KEY, activeTheme); // also clears a stale saved "dark"
    } catch {}

    if (activeTheme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => apply('system');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [activeTheme]);

  const setTheme = React.useCallback(
    (t: Theme) => {
      if (forcedTheme) return;
      setThemeState(t);
    },
    [forcedTheme]
  );

  return (
    <ThemeContext.Provider value={{ theme: activeTheme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}