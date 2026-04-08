# Email delivery (WS9.3) — v1

Product-grade **downstream** delivery via **Resend** for morning briefs and alert notifications. This is not a marketing platform: no preference center, no template CMS, no hidden retries.

## What exists

| Path | Input | Output |
|------|--------|--------|
| `POST /internal/send-brief-email` | Existing `briefId`, `to[]` | Resend send + Firestore audit row |
| `POST /internal/send-alert-email` | `alertRuleId`, `signalId`, `to[]`, optional `evaluationReference` | Resend send + Firestore audit row |

Both routes use the same internal auth pattern as other intel routes (`x-signal-intel-secret` when `INTEL_INTERNAL_SECRET` is set).

## Resend placement

- **Adapter:** `services/intel/src/lib/resend-adapter.ts` — single `fetch` to `https://api.resend.com/emails`.
- **No SDK** dependency in-repo; explicit JSON mapping and errors.
- When **`SIGNAL_RESEND_ENABLED` is false**, send functions return `status: 'skipped'` with `skippedReason: 'resend_disabled'` — **no** Firestore delivery row for skipped attempts.

## Brief email

1. Load `workspaces/{wid}/briefs/{briefId}` (validated with `BriefDocumentSchema`).
2. If `summaryRef` is set, download markdown from GCS and take a bounded excerpt (UTF-8).
3. Render sober HTML + plain text (`render-brief-email.ts`).
4. Send via Resend; record outcome.

**Does not** re-run brief generation.

## Alert email

1. Load `alertRules/{ruleId}` and `signalsLatest/{signalId}`.
2. Render concise HTML/text with rule name, signal title/type/score, detected time, optional short summary, optional `evaluationReference`.
3. Send via Resend; record outcome.

**Does not** fabricate narratives beyond stored fields.

## Delivery outcome storage

**Firestore:** `workspaces/{workspaceId}/emailDeliveries/{deliveryId}`

- Operational audit only (success/failure, provider id, **minimized recipient metadata** — count, domains, optional masked forms — subject, error message, links to `briefId` or `alertRuleId`/`signalId`). **Full raw recipient email lists are not persisted** in v1.
- Not a duplicate of BigQuery analytics for briefs/alerts; no giant event bus.

Schema: `EmailDeliveryDocumentSchema` in `packages/contracts` (`firestore-operational`).

## Runtime configuration

| Variable | When required | Purpose |
|----------|----------------|---------|
| `SIGNAL_RESEND_ENABLED` | — | Master switch |
| `SIGNAL_RESEND_API_KEY` | If enabled | Bearer token |
| `SIGNAL_RESEND_FROM_EMAIL` | If enabled | From address (Resend-verified) |
| `SIGNAL_RESEND_FROM_NAME` | Optional | Friendly name in `From` |
| `SIGNAL_RESEND_REPLY_TO` | Optional | Reply-To |
| `SIGNAL_RESEND_TIMEOUT_MS` | Optional (default 30000) | HTTP timeout |

If enabled, invalid/missing API key or from address → **fail fast at process start** (same pattern as Perplexity).

## Intentionally deferred (WS9.4+)

- Scheduler / automation wiring (Cloud Scheduler, Pub/Sub triggers).
- Unsubscribe / recipient management UX.
- In-app notification center.
- Multi-provider abstraction.
- Automatic send on every `fired` evaluation (callers orchestrate explicitly).
