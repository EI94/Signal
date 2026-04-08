resource "google_secret_manager_secret" "perplexity_api_key" {
  count = var.create_placeholder_secrets ? 1 : 0

  project   = var.project_id
  secret_id = "signal-${var.environment}-perplexity-api-key"

  replication {
    auto {}
  }

  labels = var.labels
}

resource "google_secret_manager_secret" "resend_api_key" {
  count = var.create_placeholder_secrets ? 1 : 0

  project   = var.project_id
  secret_id = "signal-${var.environment}-resend-api-key"

  replication {
    auto {}
  }

  labels = var.labels
}
