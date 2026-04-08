/**
 * Theme primitives for Signal.
 *
 * Pure helpers — no React, no DOM side-effects.
 * The inline script constant is consumed by layout.tsx to prevent theme flash.
 */

export const THEMES = ['dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = 'dark';
export const STORAGE_KEY = 'signal.theme';

export function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light';
}

export function getStoredTheme(): Theme | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return isTheme(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function storeTheme(theme: Theme): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, theme);
  } catch {
    /* quota / private-browsing — silently ignore */
  }
}

/**
 * Blocking inline script injected into `<head>` by layout.tsx.
 *
 * Runs synchronously before first paint:
 * 1. Reads persisted preference from localStorage.
 * 2. If `"light"`, sets `data-theme="light"` on `<html>`.
 * 3. Otherwise the CSS `:root` dark baseline applies — no attribute needed.
 *
 * Kept as a raw string so it can be used with `dangerouslySetInnerHTML`.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(t==="light")document.documentElement.dataset.theme="light"}catch(e){}})()`;
