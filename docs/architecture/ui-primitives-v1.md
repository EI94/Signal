# UI Primitives v1

> WS7 / Epic 7.3 — core reusable UI primitives for Signal.

## Philosophy

Primitives are **small, token-driven, composable React components** in `@signal/ui`.
They consume `--sg-*` CSS custom properties exclusively — no hardcoded values.
Each primitive does one structural job. No business logic, no data fetching, no magic.

## Primitive inventory

| Primitive | File | Purpose |
|---|---|---|
| `AppShell` | `app-shell.tsx` | Top-level layout container (flex column, full viewport) |
| `AppShellHeader` | `app-shell.tsx` | Fixed-height header bar (3.25 rem) |
| `AppShellMain` | `app-shell.tsx` | Scrollable main area + optional sidebar slot |
| `PageHeader` | `page-header.tsx` | Title + optional subtitle + optional actions |
| `Surface` | `surface.tsx` | Card/panel container (default · elevated · subtle) |
| `Table` `Thead` `Tbody` `Tr` `Th` `Td` | `table.tsx` | Semantic table with sober styling |
| `Badge` | `badge.tsx` | Status pill (neutral · accent · success · warning · danger · info) |
| `Button` | `button.tsx` | Minimal button primitive (default · ghost) |
| `Drawer` | `drawer.tsx` | Right/left side-sheet overlay with backdrop + Escape dismiss |
| `EmptyState` | `empty-state.tsx` | Centered placeholder for empty/zero-data views |
| `Skeleton` | `skeleton.tsx` | Loading placeholder (text · block variants) |
| `CommandBarShell` | `command-bar-shell.tsx` | Structural container for future command bar input |

### Utility

| Export | File | Purpose |
|---|---|---|
| `.sg-icon-btn` | `primitives.css` | CSS class for small icon buttons (theme toggle, future actions) |
| `.sg-btn` | `primitives.css` | CSS class backing `Button` component |
| `cx()` | `cx.ts` | Internal class-name concatenation (not exported from package) |

## CSS architecture

All primitive styles live in one file: `packages/ui/src/primitives.css`.

- Class prefix: `sg-` (matches token namespace `--sg-*`)
- Naming: BEM-ish (`sg-surface`, `sg-surface--elevated`, `sg-badge--danger`)
- Variant modifier classes use `--{variant}` suffix
- No CSS-in-JS, no CSS modules, no utility classes
- Consumers import once: `import '@signal/ui/primitives.css'`

## Consumption

```tsx
// apps/web/src/app/layout.tsx
import '@signal/ui/tokens.css';      // design tokens
import '@signal/ui/primitives.css';  // primitive styles
import { AppShell, AppShellHeader, AppShellMain } from '@signal/ui';
```

## Component API patterns

All server-safe primitives accept `className` + standard HTML attributes via `...rest` spread.
This allows consumers to add positioning, margins, or data attributes without wrapper divs.

Only `Drawer` requires `'use client'` (keyboard dismiss + body scroll lock).

## Intentionally excluded

| Item | Reason |
|---|---|
| Panel | Surface covers the same need (cards, panels, summary blocks) |
| Input | Deferred; command bar provides structural shell only |
| Icon system | Deferred; primitives use text characters where needed |
| Modal/Dialog | Drawer covers side-sheet; centered modals deferred |
| Tabs/Accordion | Not needed until WS8 entity detail views |
| Toast/Notification | Deferred to notification feature work |

## Intentionally deferred

| Item | Deferred to |
|---|---|
| Tailwind integration | If adopted later |
| Chart/map tokens | WS8+ |
| Advanced Drawer animation | WS8+ |
| Focus trap in Drawer | WS8+ (a11y hardening) |
| Sidebar navigation content | WS8 shell |

## Brand alignment (WS7.4)

Visual refinements applied in WS7.4 to achieve a premium, industrial, executive dark-first aesthetic:

| Change | Before | After | Rationale |
|---|---|---|---|
| `--sg-radius-lg` | 10 px | 8 px | Sharper corners, less bubbly, more industrial |
| Shell header height | 3 rem | 3.25 rem | More executive breathing room |
| Shell brand treatment | Plain semibold | Uppercase + wide tracking | Industrial wordmark feel |
| Shell main padding | `space-6` | `space-6 space-8` | Wider horizontal breathing room |
| PageHeader title | `text-2xl` | `text-xl`, semibold, tight tracking | Tighter hierarchy, less template-y |
| PageHeader bottom margin | `space-6` | `space-5` | Tighter rhythm |
| Badge padding | `0.0625rem 0.375rem` | `space-1 space-2` | More readable, comfortable |
| EmptyState title color | `--sg-text` | `--sg-text-secondary` | Calmer, less aggressive |
| Global `h1`/`p` overrides | Present | Removed | Component-driven typography only |
| Auth panel buttons | Ad-hoc CSS | `Button` primitive | Consistent, reusable |
