# Brand Identity v1

> WS7 / Epic 7.4 — visual alignment of Signal towards MAIRE-inspired industrial-executive aesthetic.

## Design direction

Signal is a **board-level enterprise intelligence platform**. The visual language must communicate:

- **Authority**: calm, sharp, confident — not flashy
- **Precision**: tight spacing, deliberate hierarchy, no excess
- **Industrial-tech**: dark-first palette, restrained radius, uppercase wordmark
- **Premium quality**: every pixel is intentional; nothing feels like a template

The aesthetic reference is **MAIRE** — an executive dashboard sensibility where information density is high but visual noise is near zero.

## Principles

| Principle | Rule |
|---|---|
| Dark first | Dark theme is the default; light is available but secondary |
| Token driven | Every value comes from `--sg-*` CSS custom properties |
| Component typography | No global `h1`/`p` styling — each component owns its text treatment |
| Restrained radius | `--sg-radius-lg` at 8 px keeps surfaces sharp without brutalism |
| Executive spacing | Generous padding in the shell and content area; tight padding in controls |
| Industrial wordmark | "SIGNAL" rendered uppercase with wide letter-spacing in the shell header |
| Subtle elevation | Minimal shadow usage; rely on border + surface color for layer distinction |

## Token refinements (vs WS7.1 baseline)

| Token | WS7.1 | WS7.4 | Reason |
|---|---|---|---|
| `--sg-radius-lg` | 10 px | 8 px | Sharper surfaces, more industrial |

All other tokens remain unchanged. The dark palette, spacing scale, and typography scale
established in WS7.1 proved correct and required no adjustment.

## Primitive refinements (vs WS7.3 baseline)

### Shell

- Header height: 3 rem → **3.25 rem** (52 px) — executive breathing room
- Header horizontal padding: `space-4` → **`space-5`** — wider frame
- Brand span: added `text-transform: uppercase`, `letter-spacing: 0.08em` — industrial wordmark
- Main area: horizontal padding `space-6` → **`space-8`** — content column feels less cramped

### PageHeader

- Title font-size: `text-2xl` → **`text-xl`** — tighter, less template-like
- Bottom margin: `space-6` → **`space-5`** — crisper vertical rhythm

### Badge

- Padding: `0.0625rem 0.375rem` → **`space-1 space-2`** (4 px / 8 px) — more readable

### EmptyState

- Title color: `--sg-text` → **`--sg-text-secondary`** — calmer, not screaming
- Outer padding: `space-12` → **`space-16 space-6`** — taller vertical space, tighter horizontal

### Button (new)

Minimal button primitive added to replace ad-hoc auth panel button CSS.

| Variant | Style |
|---|---|
| `default` | Surface-elevated background, border, hover darkens border |
| `ghost` | Transparent background, transparent border, hover shows `--sg-hover` |

### Global CSS cleanup

- Removed global `h1` and `p` element styles from `globals.css`
- Removed `.auth-panel button` ad-hoc styles (now handled by `Button` primitive)

## What was NOT changed

- Color palette (dark and light) — already correct
- Typography scale — already calibrated
- Spacing scale — already consistent
- Font stack (system-ui) — proper typeface deferred to when brand guidelines dictate
- Surface padding — already comfortable at `space-5`
- Table styling — already sober
- Drawer, Skeleton, CommandBarShell — no visual issues

## What remains deferred

| Item | Deferred to |
|---|---|
| Custom typeface loading | Brand guidelines or design review |
| Micro-animations (page transitions, skeleton shimmer direction) | WS8+ |
| Icon system | WS8+ |
| Input / form primitives | WS8 when forms are needed |
