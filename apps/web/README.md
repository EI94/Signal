# apps/web (Next.js)

## Runtime environment

### Firebase (client)

Copy `.env.example` to **`.env.local`** and set the values from the Firebase console → Project settings → Your apps → Web app config — or from the Firebase CLI after `firebase login`:

```bash
firebase apps:list --project signal-ac219
firebase apps:sdkconfig WEB <AppId> --project signal-ac219
```

Map the printed `apiKey`, `authDomain`, `projectId`, `appId` to `NEXT_PUBLIC_FIREBASE_*` (and optional `storageBucket` / `messagingSenderId` / `measurementId` if you use those products).

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Web API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Usually `project-id.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Project ID (must match API `FIREBASE_PROJECT_ID`) |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | App ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Optional — e.g. `project-id.firebasestorage.app` (Storage SDK) |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Optional — numeric sender id (FCM if used) |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Optional — `G-…` for Analytics; use `getFirebaseAnalytics()` from `src/lib/firebase/analytics.ts` (client only) |
| `NEXT_PUBLIC_SIGNAL_API_BASE_URL` | Base URL for `apps/api` (e.g. `http://localhost:4000`) — used to call `GET /v1/auth/me` after sign-in |
| `NEXT_PUBLIC_SIGNAL_MAP_TILE_URL` | **Required for production builds:** Leaflet tile URL template (e.g. `https://…/{z}/{x}/{y}.png`). If unset in `NODE_ENV=production`, the map shows a degraded message (no silent OSM fallback). |
| `NEXT_PUBLIC_SIGNAL_MAP_ATTRIBUTION` | Optional HTML/snippet for map attribution (defaults to `"Map tiles"` when URL is set but attribution omitted). |

If any Firebase keys are missing, the app treats Firebase as **not configured** and shows a neutral message (no fake sign-in). If the API base URL is missing, workspace/role information is not shown (no fake data).

### Product routes (all use `GET` on `apps/api` with Firebase ID token)

| Route | Data |
|-------|------|
| `/` | Board summary (`/v1/board/summary`) |
| `/signals` | Paginated feed (`/v1/signals`) |
| `/map` | Map points (`/v1/map/signals`) — Leaflet when `lat`/`lng` exist; tile URL from `NEXT_PUBLIC_SIGNAL_MAP_TILE_URL` in production (see `docs/architecture/production-posture-v1.md`). Non-production may use OSM fallback when unset. Without coordinates, region list from `regionKey` only (no synthetic coordinates) |
| `/entities/[entityType]/[entityId]` | Entity detail (`/v1/entities/:entityType/:entityId`) — identity, recent signals, timeline preview. Entity links are clickable from feed, board, and map surfaces. |
| `/notifications` | Notification list (`GET /v1/notifications`) and mark read / dismiss (`PATCH /v1/notifications/:notificationId`). No client Firestore. |

**Only** variables prefixed with **`NEXT_PUBLIC_*`** may be used in client code. Never put API keys, service accounts, or Admin credentials in this prefix.

Server-only settings belong in **`apps/api`** or **`services/*`**, not in this app’s client bundle.

Do **not** import `@signal/config` server loaders (`loadApiRuntimeConfig`, etc.) from React client components — they are Node-only.
