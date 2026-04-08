# Source registry samples (dev / reference)

These files are **not** loaded by the API at runtime.

- **`sample-sources.json`** — Example `SourceRegistryDocument` objects for manual seeding or tests. Dates are ISO 8601 strings; at runtime, Firestore `Timestamp` fields are normalized to `Date` in the API boundary before Zod validation.

When importing via the Firebase console, convert string timestamps to Firestore timestamps, or use `putSource` / Admin SDK with `Date` objects.

See [docs/architecture/source-registry-v1.md](../../docs/architecture/source-registry-v1.md).
