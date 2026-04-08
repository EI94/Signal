resource "google_cloud_tasks_queue" "ingest" {
  name     = "signal-${var.environment}-ingest"
  location = var.region
  project  = var.project_id

  rate_limits {
    max_dispatches_per_second = var.ingest_max_dispatches_per_second
  }

  retry_config {
    max_attempts = var.ingest_max_attempts
  }
}

resource "google_cloud_tasks_queue" "intel" {
  name     = "signal-${var.environment}-intel"
  location = var.region
  project  = var.project_id

  rate_limits {
    max_dispatches_per_second = var.intel_max_dispatches_per_second
  }

  retry_config {
    max_attempts = var.intel_max_attempts
  }
}
