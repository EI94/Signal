-- Signal — MVP analytical tables (v1)
-- Before apply: substitute placeholders in qualified names:
--   PROJECT_ID  → GCP project (e.g. signal-ac219)
--   DATASET_ID  → analytics dataset (e.g. signal_staging_analytics; must match env / Terraform signal_<env>_analytics)
-- Example (staging): sed -e 's/PROJECT_ID/signal-ac219/g' -e 's/DATASET_ID/signal_staging_analytics/g' this_file.sql | bq query ...
-- See: docs/architecture/bigquery-analytical-schema-v1.md
-- ARRAY columns: BigQuery rejects NOT NULL on ARRAY<...> (NULL arrays are stored as empty). Use ARRAY<STRING> without NOT NULL.

CREATE TABLE IF NOT EXISTS `PROJECT_ID.DATASET_ID.source_contents` (
  source_content_id STRING NOT NULL,
  source_id STRING NOT NULL,
  registry_source_type STRING NOT NULL,
  source_type STRING NOT NULL,
  mime_type STRING,
  source_url STRING,
  content_hash STRING NOT NULL,
  published_at TIMESTAMP,
  observed_at TIMESTAMP NOT NULL,
  archived_gcs_uri STRING NOT NULL,
  normalized_gcs_uri STRING,
  extraction_status STRING,
  extraction_error_code STRING,
  extracted_event_count INT64,
  language STRING,
  workspace_id STRING,
  created_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(observed_at)
CLUSTER BY source_id, source_type
OPTIONS (description = 'Historical source content metadata; raw bytes live in GCS. normalized_gcs_uri = optional normalized .txt; extraction_error_code = short machine code when status is skipped/failed.');

CREATE TABLE IF NOT EXISTS `PROJECT_ID.DATASET_ID.extracted_events` (
  extracted_event_id STRING NOT NULL,
  event_family STRING NOT NULL,
  event_time TIMESTAMP NOT NULL,
  event_time_precision STRING,
  confidence INT64,
  ambiguity_notes STRING,
  evidence_source_content_ids ARRAY<STRING>,
  extracted_facts_json JSON,
  linked_entity_refs_json JSON,
  created_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(event_time)
CLUSTER BY event_family
OPTIONS (description = 'Candidate extracted events; distinct from signals.');

CREATE TABLE IF NOT EXISTS `PROJECT_ID.DATASET_ID.signals` (
  signal_id STRING NOT NULL,
  workspace_id STRING,
  signal_type STRING NOT NULL,
  entity_refs_json JSON,
  title STRING NOT NULL,
  short_summary STRING,
  status STRING NOT NULL,
  novelty STRING,
  occurred_at TIMESTAMP NOT NULL,
  detected_at TIMESTAMP NOT NULL,
  latest_composite_score INT64,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(detected_at)
CLUSTER BY signal_type, workspace_id
OPTIONS (description = 'Analytical signal history; not the Firestore read model.');

CREATE TABLE IF NOT EXISTS `PROJECT_ID.DATASET_ID.signal_score_history` (
  signal_id STRING NOT NULL,
  scored_at TIMESTAMP NOT NULL,
  relevance INT64,
  impact INT64,
  freshness INT64,
  confidence INT64,
  source_authority INT64,
  composite_score INT64 NOT NULL,
  scoring_version STRING NOT NULL,
  workspace_id STRING
)
PARTITION BY DATE(scored_at)
CLUSTER BY signal_id
OPTIONS (description = 'Score dimension snapshots; scoring_version labels model generation.');

CREATE TABLE IF NOT EXISTS `PROJECT_ID.DATASET_ID.entity_signal_links` (
  entity_type STRING NOT NULL,
  entity_id STRING NOT NULL,
  signal_id STRING NOT NULL,
  signal_type STRING NOT NULL,
  occurred_at TIMESTAMP,
  detected_at TIMESTAMP NOT NULL,
  composite_score INT64,
  status STRING NOT NULL,
  novelty STRING,
  workspace_id STRING
)
PARTITION BY DATE(detected_at)
CLUSTER BY entity_type, entity_id
OPTIONS (description = 'Denormalized bridge for entity-centric analytics.');

CREATE TABLE IF NOT EXISTS `PROJECT_ID.DATASET_ID.brief_runs` (
  brief_run_id STRING NOT NULL,
  workspace_id STRING NOT NULL,
  brief_type STRING NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status STRING NOT NULL,
  source_signal_ids ARRAY<STRING>,
  generated_at TIMESTAMP,
  model_assisted BOOL,
  created_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(created_at)
CLUSTER BY workspace_id
OPTIONS (description = 'Brief generation run metadata only.');

CREATE TABLE IF NOT EXISTS `PROJECT_ID.DATASET_ID.alert_evaluations` (
  evaluation_id STRING NOT NULL,
  workspace_id STRING NOT NULL,
  alert_rule_id STRING NOT NULL,
  signal_id STRING NOT NULL,
  outcome STRING NOT NULL,
  reason_code STRING,
  evaluated_at TIMESTAMP NOT NULL,
  cooldown_applied BOOL,
  created_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(evaluated_at)
CLUSTER BY workspace_id, alert_rule_id
OPTIONS (description = 'Append-only alert evaluation history (one row per evaluation event). evaluation_id identifies a distinct event; use request evaluationRunId for idempotent retries + streaming insertId. Not live rule config.');

CREATE TABLE IF NOT EXISTS `PROJECT_ID.DATASET_ID.usage_events` (
  usage_event_id STRING NOT NULL,
  event_type STRING NOT NULL,
  workspace_id STRING,
  service_name STRING NOT NULL,
  provider STRING,
  outcome STRING NOT NULL,
  quantity INT64 NOT NULL,
  unit STRING NOT NULL,
  related_object_id STRING,
  metadata_json JSON,
  occurred_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(occurred_at)
CLUSTER BY service_name, event_type
OPTIONS (description = 'WS10.1 append-only usage metering; event_type vocabulary in @signal/contracts usage-metering.');
