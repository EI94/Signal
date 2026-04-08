# Theme Engine v1

> WS7 / Epic 7.2 — dark default with user-selectable light mode.

## Model

| Aspect | Value |
|---|---|
| Supported themes | `dark`, `light` |
| Default | `dark` |
| Persistence | `localStorage` key `signal.theme` |
| DOM contract | `data-theme` attribute on `<html>` |
| Token source | `packages/ui/src/tokens.css` (unchanged) |

No "system" / "auto" mode in this phase — explicit user choice only.

## Anti-flicker strategy

**Problem**: the server renders dark HTML; if the user previously chose light, a naive client-only approach shows a dark flash before React hydrates and applies the stored preference.

**Solution**: a tiny **blocking inline `<script>`** in `<head>` that runs synchronously before first paint:

```js
(function(){
  try {
    var t = localStorage.getItem("signal.theme");
    if (t === "light") document.documentElement.dataset.theme = "light";
  } catch(e) {}
})()
```

Behavior:
1. Server renders `<html lang="en" suppressHydrationWarning>` with no `data-theme` (dark baseline).
2. Browser executes the inline script before any CSS paint.
3. If `signal.theme === "light"` in localStorage, `data-theme="light"` is set and the CSS `[data-theme="light"]` selector activates.
4. Otherwise, `:root` dark tokens apply — no attribute needed.
5. React hydrates; `ThemeProvider` reads the DOM attribute and syncs client state.

`suppressHydrationWarning` on `<html>` silences the expected server/client mismatch on the `data-theme` attribute.

## Runtime API

`apps/web/src/lib/theme.ts` — pure helpers (no React):

| Export | Type | Purpose |
|---|---|---|
| `Theme` | `'dark' \| 'light'` | Theme type union |
| `THEMES` | `readonly ['dark','light']` | Enumerable values |
| `DEFAULT_THEME` | `'dark'` | Product default |
| `STORAGE_KEY` | `'signal.theme'` | localStorage key |
| `isTheme(v)` | type guard | Validate unknown input |
| `getStoredTheme()` | `Theme \| null` | Read + validate from localStorage |
| `storeTheme(t)` | `void` | Write to localStorage |
| `THEME_INIT_SCRIPT` | `string` | Raw JS for `dangerouslySetInnerHTML` |

`apps/web/src/components/theme/theme-provider.tsx` — React context:

| Export | Purpose |
|---|---|
| `ThemeProvider` | Wraps app; manages state, syncs DOM + localStorage |
| `useTheme()` | `{ theme, setTheme, toggleTheme }` |

## Wiring

```
layout.tsx
├── <html suppressHydrationWarning>
│   ├── <head>
│   │   └── <script> THEME_INIT_SCRIPT </script>   ← blocking, pre-paint
│   └── <body>
│       └── <ThemeProvider>                         ← client state
│           └── <AuthProvider>
│               └── {children}
```

## File map

| File | Role |
|---|---|
| `apps/web/src/lib/theme.ts` | Pure types + helpers + inline script |
| `apps/web/src/components/theme/theme-provider.tsx` | React context + hook |
| `apps/web/src/components/theme/theme-toggle.tsx` | Tiny dev toggle (moves to shell later) |
| `apps/web/src/app/layout.tsx` | Inline script injection + ThemeProvider |
| `apps/web/src/app/globals.css` | `.theme-toggle` styles |
| `apps/web/src/lib/__tests__/theme.test.ts` | Unit tests for helpers |

## Intentionally deferred

| Item | Deferred to |
|---|---|
| System/auto `prefers-color-scheme` sync | WS7.3 (if desired) |
| Server-stored theme preferences | WS8+ (user settings) |
| Theme transition animations | WS7.3 component layer |
| Settings page UI | WS8+ |
| Shell-level theme control | WS7.3 |
