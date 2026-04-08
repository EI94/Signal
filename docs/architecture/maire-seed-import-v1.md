# MAIRE CSV seed import (tooling) — v1

One-off **operator CLI** (`@signal/maire-seed-import`) to load MAIRE business-truth CSVs into Firestore. **Not** a user-facing or product runtime API.

## Inputs

| File | Firestore landing |
|------|-------------------|
| `Entities.csv` | `workspaces/{workspaceId}/businessEntitySeeds/{entityId}` — `BusinessEntitySeedDocument` (`packages/contracts`). Explicit bootstrap truth; not the full ontology graph. |
| `Sources.csv` | `sources/{sourceId}` — `SourceRegistryDocument` (global registry). `sourceId` is deterministic from `canonicalUrl`. |
| `Watchlists.csv` | `workspaces/{workspaceId}/watchlists/{watchlistId}` — `WatchlistDocument`. `watchlistId` is deterministic from workspace + watchlist name. |

## Resolution rules

- **Entity IDs:** `entityId = deterministicUuid("entitySeed:" + entityType + ":" + canonicalName)` (stable UUID shape).
- **Sources `linkedEntityRefs`:** cell is `;`-separated tokens matched against entity **canonical names** and **aliases** (case-insensitive). If a token matches **more than one** seeded entity, the **whole source row is invalid** (ambiguous; no silent pick). Tokens that match **zero** entities are listed in the source `notes` (truncated to schema max) and omitted from `linkedEntityRefs`.
- **Watchlists:** rows grouped by `watchlistName`. Each `(entityType, entityIdOrCanonicalName)` resolves with **scoped** match: same `entityType` plus canonical name or alias (with a controlled fallback to the global key map when exactly one entity of that type matches). **Unresolved or ambiguous rows are invalid:** the watchlist group is not written and each bad row increments `invalid`. Row-level `priority` is **not** stored on `WatchlistDocument` (schema has no per-ref priority); static text in `description` states this.

## CSV → registry mappings

- **Source `category` (MAIRE-specific labels)** maps into `SourceCategorySchema` (e.g. `group_corporate` → `corporate_reporting`). Unknown labels fail row validation.
- **`checkFrequencyBucket`:** `monthly` maps to `weekly` (contract has no `monthly`); noted in `notes`.
- **`priorityTier`:** `p2_low` maps to `p2_standard`.

## CLI

Requires `GOOGLE_APPLICATION_CREDENTIALS` or gcloud ADC for `--apply`.

```bash
pnpm maire-seed -- --workspace <WORKSPACE_ID> \
  --file-entities Entities.csv --file-sources Sources.csv --file-watchlists Watchlists.csv
```

Dry-run is the default when **`--apply` is omitted** (validation + summary; no writes). **`--strict`** in dry-run exits non-zero if any row is invalid (for CI); without **`--strict`**, dry-run still prints issues but exits 0.

```bash
pnpm maire-seed -- --workspace <WORKSPACE_ID> --strict \
  --file-entities Entities.csv --file-sources Sources.csv --file-watchlists Watchlists.csv
```

```bash
pnpm maire-seed -- --workspace <WORKSPACE_ID> --apply \
  --file-entities Entities.csv --file-sources Sources.csv --file-watchlists Watchlists.csv
```

Optional: `--created-by`, `--seed-label` (stored on entity seed docs).

## Idempotency

Repeated `--apply` runs **set** the same document IDs again; counts show **created** on first write and **updated** when the doc already existed.

## Timestamps on re-apply

On **create**, `createdAt` and `updatedAt` are set from the import run. On **update**, existing **`createdAt` is preserved** from Firestore and only **`updatedAt`** is set to the current run time (entity seeds, registry sources, watchlists).

## Implementation note (repo)

`@signal/contracts` is published as **ESM** (`"type": "module"`) so the importer CLI (`tsx` entry) gets real ESM named exports. The package also exposes subpaths `@signal/contracts/firestore-operational` and `@signal/contracts/source-registry` for leaf imports used by the importer.
