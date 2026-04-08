output "repository_id" {
  value = var.create_repository ? google_artifact_registry_repository.containers[0].repository_id : null
}

output "repository_url" {
  value = var.create_repository ? "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.containers[0].repository_id}" : null
}
