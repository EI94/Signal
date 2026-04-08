resource "google_artifact_registry_repository" "containers" {
  count = var.create_repository ? 1 : 0

  location      = var.region
  repository_id = "signal-${var.environment}-containers"
  description   = "Docker images for Signal Cloud Run services (${var.environment})."
  format        = "DOCKER"
  project       = var.project_id

  labels = var.labels
}
