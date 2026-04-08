# Production posture (map + CSP + email audit) — v1

Concise operational notes for go-live. This is policy and wiring, not a full security program.

## Map tiles (`apps/web`)

- **Development / non-production builds** (`NODE_ENV !== 'production'`): if `NEXT_PUBLIC_SIGNAL_MAP_TILE_URL` is unset, the app may use a **documented public OSM tile template** as a dev convenience. Attribution is bundled for that fallback.
- **Production builds** (`NODE_ENV === 'production'`): **no silent OSM fallback**. You must set **`NEXT_PUBLIC_SIGNAL_MAP_TILE_URL`** (and optionally **`NEXT_PUBLIC_SIGNAL_MAP_ATTRIBUTION`**) to your provider’s tile URL template (e.g. `…/{z}/{x}/{y}.png`). If the URL is missing, the map stage shows an **explicit degraded message** instead of loading third-party tiles.
- Staging or preview environments that run `next build` / `next start` use `NODE_ENV=production` — configure the same variables there.

Resolver: `apps/web/src/lib/map-tile-config.ts`.

## Content Security Policy (target)

- The app may ship an **inline theme bootstrap script** in the document (current pattern). **Target posture for production hardening** is **nonce-backed CSP** for `script-src` so inline scripts are either removed or explicitly allowed via nonce.
- **Not implemented in this doc’s patch** unless a small follow-up lands; no CSP “framework” in-repo.

## Email delivery audit (`services/intel` → Firestore `emailDeliveries`)

- Resend **sends** to the full `to[]` list at runtime (unchanged).
- Firestore **audit documents** store **recipientCount**, **recipientDomains[]**, optional **recipientsMasked[]** (first-character masked, capped), plus **providerMessageId**, status, timestamps, failure text, and business keys (`briefId`, `alertRuleId`, etc.). **Full recipient email lists are not written** to the audit document.
- Builder: `services/intel/src/lib/email-delivery-recipient-audit.ts`.

See also [email-delivery-v1.md](./email-delivery-v1.md).
