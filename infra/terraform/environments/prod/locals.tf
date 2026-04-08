locals {
  default_labels = {
    app         = "signal"
    environment = var.environment
    managed_by  = "terraform"
  }

  # Naming: see ../README.md#naming
  raw_bucket_name = "${var.project_id}-signal-${var.environment}-raw"
  bq_dataset_id   = "signal_${var.environment}_analytics"

  enabled_apis = [
    "serviceusage.googleapis.com",
    "iam.googleapis.com",
    "run.googleapis.com",
    "firestore.googleapis.com",
    "bigquery.googleapis.com",
    "storage.googleapis.com",
    "pubsub.googleapis.com",
    "cloudtasks.googleapis.com",
    "cloudscheduler.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
  ]

  pubsub_topics = [
    "source.delta.detected",
    "signal.scored",
    "alert.triggered",
  ]
}
