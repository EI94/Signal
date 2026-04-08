# Design Tokens v1

> WS7 / Epic 7.1 — canonical design-token foundation for Signal.

## Philosophy

Signal's visual language is **dark-first, premium, industrial-tech, executive**.
Tokens are the single source of truth for every visual decision.
Components and pages reference semantic CSS custom properties (`--sg-*`); raw hex/rgb values never appear in component code.

The token layer is intentionally small:
- One CSS file (`packages/ui/src/tokens.css`).
- Flat custom-property namespace (`--sg-{semantic}`).
- No build tool, no JSON-to-CSS pipeline, no generated theme files.
- Direct consumption via `@import` or CSS-in-JS `var()` references.

## Dark vs Light strategy

| Aspect | Dark (primary) | Light |
|---|---|---|
| Defined on | `:root` | `[data-theme="light"]` |
| `color-scheme` | `dark` | `light` |
| Product default | Yes | No (designed, not yet toggled) |

Both palettes are fully specified now.
Theme switching is implemented in WS7.2 (see [Theme Engine v1](theme-engine-v1.md)):
a blocking inline script reads `localStorage("signal.theme")` and sets
`data-theme="light"` before first paint when the user has chosen light mode.

## Naming convention

```
--sg-{category?}-{semantic}
```

`sg` = Signal namespace.
Category is omitted when unambiguous (e.g. `--sg-bg`, `--sg-text`).

### Color tokens

| Token | Role |
|---|---|
| `--sg-bg` | Page / app background |
| `--sg-surface` | Card, panel, sidebar |
| `--sg-surface-elevated` | Modal, dropdown, popover |
| `--sg-border` | Default structural border |
| `--sg-border-strong` | Emphasized border |
| `--sg-text` | Primary body text |
| `--sg-text-secondary` | Secondary / supporting text |
| `--sg-text-muted` | Captions, placeholders, decorative |
| `--sg-accent` | Primary interactive / brand accent |
| `--sg-accent-hover` | Accent on hover |
| `--sg-accent-fg` | Text on accent background |
| `--sg-success` | Positive / confirmed state |
| `--sg-warning` | Caution state |
| `--sg-danger` | Error / destructive state |
| `--sg-info` | Informational state |
| `--sg-{status}-fg` | Text on status background |
| `--sg-hover` | Translucent hover overlay |
| `--sg-active` | Translucent active/pressed overlay |
| `--sg-selection` | Selection highlight (accent tinted) |
| `--sg-focus-ring` | Focus ring color (keyboard nav) |

### Typography tokens

| Token | Value (dark/light identical) |
|---|---|
| `--sg-font-sans` | system-ui stack |
| `--sg-font-mono` | ui-monospace stack |
| `--sg-text-xs` … `--sg-text-3xl` | 12 → 30 px scale |
| `--sg-leading-tight` … `--sg-leading-relaxed` | 1.2 → 1.65 |
| `--sg-weight-normal` … `--sg-weight-bold` | 400 → 700 |
| `--sg-tracking-tight` / `normal` / `wide` | letter-spacing |

### Spacing

`--sg-space-{n}` where n ∈ {0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20}.
Values are `0.25rem × n` (4 px base unit).

### Radius

| Token | Value |
|---|---|
| `--sg-radius-sm` | 4 px |
| `--sg-radius-md` | 6 px |
| `--sg-radius-lg` | 10 px |
| `--sg-radius-xl` | 16 px |
| `--sg-radius-full` | 9999 px (pill) |

### Elevation

| Token | Usage |
|---|---|
| `--sg-shadow-sm` | Subtle lift (cards) |
| `--sg-shadow-md` | Dropdown, popover |
| `--sg-shadow-lg` | Modal, dialog |

Shadow intensity differs between themes (darker shadows in dark mode to maintain perceptibility on dark backgrounds; lighter in light mode).

### Motion

| Token | Value |
|---|---|
| `--sg-duration-fast` | 100 ms |
| `--sg-duration-normal` | 200 ms |
| `--sg-duration-slow` | 350 ms |
| `--sg-ease-default` | ease-out cubic |
| `--sg-ease-out` | decelerate cubic |
| `--sg-ease-in-out` | symmetric cubic |

## Consumption

### apps/web

```tsx
// layout.tsx
import '@signal/ui/tokens.css';  // loads :root variables
import './globals.css';           // base resets + element styles using var(--sg-*)
```

### packages/ui (future components)

Components import the same token file or receive variables through CSS cascade.
The `@signal/ui` package exports `./tokens.css` via its `package.json` exports map.

### Tailwind (if adopted later)

Tokens can be mapped into a Tailwind `theme.extend` block referencing `var(--sg-*)`.
No Tailwind configuration is created now — this is deferred until component work begins.

## Intentionally deferred

| Item | Deferred to |
|---|---|
| ~~Theme toggle (`data-theme` switching)~~ | ~~WS7.2~~ — done, see [Theme Engine v1](theme-engine-v1.md) |
| ~~Component primitives (Surface, Badge, …)~~ | ~~WS7.3~~ — done, see [UI Primitives v1](ui-primitives-v1.md) |
| Chart / map styling tokens | WS8+ |
| Motion / animation system | WS9+ |
| Tailwind integration | WS7.3 (if adopted) |

## Palette rationale

### Dark

- Base: deep blue-black (`#0c0e12`) — not pure black (reduces eye strain), cool undertone signals technology.
- Surfaces: progressively lighter slates to create layering without relying heavily on shadows.
- Accent: restrained teal-blue (`#4a9aba`) — professional, readable on dark, industrial feel.
- Status colors: desaturated enough to coexist with the accent without visual competition.
- Text primary: warm off-white (`#e3e6eb`) — softer than `#fff`, high contrast on base.
- Text secondary passes WCAG AA on `--sg-bg` (≈ 5.8:1 contrast ratio).

### Light

- Base: light warm-gray (`#f4f5f7`) — not pure white, reduces glare.
- Surfaces: white cards on the off-white background give depth.
- Accent: slightly deeper teal (`#2e7fa3`) to maintain contrast on light backgrounds.
- Status colors adjusted to keep consistent meaning with sufficient contrast.
