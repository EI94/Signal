'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_THEME, getStoredTheme, isTheme, storeTheme, type Theme } from '../../lib/theme';

export type ThemeContextValue = {
  /** Currently active theme. */
  readonly theme: Theme;
  /** Set theme explicitly. Persists to localStorage and updates `data-theme`. */
  readonly setTheme: (t: Theme) => void;
  /** Toggle between dark and light. */
  readonly toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Reads the initial theme from the DOM attribute set by the inline anti-flicker
 * script (layout.tsx `<head>`).  Falls back to DEFAULT_THEME on the server or
 * when the attribute is absent.
 */
function readInitialTheme(): Theme {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  const attr = document.documentElement.dataset.theme;
  return isTheme(attr) ? attr : DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    const stored = getStoredTheme();
    if (stored) {
      setThemeState(stored);
    }
  }, []);

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.dataset.theme = 'light';
    } else {
      delete document.documentElement.dataset.theme;
    }
    storeTheme(theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);

  const toggleTheme = useCallback(
    () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark')),
    [],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
