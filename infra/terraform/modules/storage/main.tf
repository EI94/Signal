resource "google_storage_bucket" "raw_archive" {
  name          = var.bucket_name
  location      = var.region
  project       = var.project_id
  force_destroy = var.force_destroy

  uniform_bucket_level_access = true

  versioning {
    enabled = var.versioning_enabled
  }

  dynamic "lifecycle_rule" {
    for_each = var.raw_archive_lifecycle_age_days != null ? [1] : []
    content {
      action {
        type = "Delete"
      }
      condition {
        age = var.raw_archive_lifecycle_age_days
      }
    }
  }

  labels = var.labels
}
