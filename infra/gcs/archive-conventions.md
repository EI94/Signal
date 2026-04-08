# GCS object key conventions (v1) — normative summary

Full narrative: [docs/architecture/gcs-source-archive-v1.md](../../docs/architecture/gcs-source-archive-v1.md).

## Key template

```
{family}/source/{source_id}/date={YYYY-MM-DD}/{source_content_id}.{ext}
```

- `family`: `raw` | `normalized` | `manifests`
- `source_id`: stable source registry id (no display names)
- `source_content_id`: 32-char lowercase hex content id (deterministic per ontology)
- `date`: UTC **observation** date for partition (ingest chooses boundary; typically fetch day)

## Extensions

| Segment | Family | Use |
|--------|--------|-----|
| `.{html\|pdf\|json\|xml\|bin}` | `raw` | Raw snapshot format |
| `.txt` | `normalized` | Extracted/cleaned text |
| `.manifest.json` | `manifests` | Full file name = `{source_content_id}.manifest.json` |

## Primary BigQuery reference

- `source_contents.archived_gcs_uri` = `gs://<bucket>/<key>` for the **primary raw** object.

## Helpers

TypeScript builders (no I/O): `@signal/contracts` → `buildRawSourceObjectKey`, `buildNormalizedTextObjectKey`, `buildManifestObjectKey`, `gsUri`.
