variable "project_id" {
  type        = string
  description = "GCP project ID for this environment (never commit real IDs in examples)."
}

variable "region" {
  type        = string
  description = "Primary region for regional resources (Cloud Run, Tasks, GCS, Artifact Registry)."
  default     = "europe-west1"
}

variable "environment" {
  type        = string
  description = "Environment key (dev, staging, prod)."
  default     = "dev"
}

variable "bigquery_location" {
  type        = string
  description = "BigQuery dataset location (e.g. EU or europe-west1)."
  default     = "EU"
}

variable "firestore_location_id" {
  type        = string
  description = "Firestore database location (regional or multi-region id, e.g. europe-west1 or eur3)."
  default     = "europe-west1"
}

variable "manage_firestore_database" {
  type        = bool
  description = "Create (default) Firestore native DB. Set false if the default DB already exists and import instead."
  default     = true
}

variable "raw_bucket_force_destroy" {
  type        = bool
  default     = true
  description = "Allow bucket delete with objects in dev; use false in prod."
}

variable "bq_delete_contents_on_destroy" {
  type        = bool
  default     = true
  description = "If true, delete BigQuery tables when dataset is destroyed (dev only)."
}

variable "create_placeholder_secrets" {
  type        = bool
  default     = true
  description = "Create empty Secret Manager secrets (no versions yet)."
}

variable "create_artifact_registry" {
  type        = bool
  default     = true
  description = "Create Docker Artifact Registry for Cloud Run images."
}

variable "create_intel_pubsub_subscription" {
  type        = bool
  default     = true
  description = "Create pull subscription for intel on source.delta.detected."
}

variable "raw_archive_lifecycle_age_days" {
  type        = number
  default     = null
  description = "Optional GCS lifecycle: delete objects older than N days (null = keep)."
}
