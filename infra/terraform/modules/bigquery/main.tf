resource "google_bigquery_dataset" "analytics" {
  dataset_id                 = var.dataset_id
  project                    = var.project_id
  location                   = var.location
  description                = "Signal analytical / historical layer (${var.environment})."
  delete_contents_on_destroy = var.delete_contents_on_destroy

  labels = var.labels
}
