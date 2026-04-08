variable "project_id" {
  type = string
}

variable "environment" {
  type = string
}

variable "dataset_id" {
  type        = string
  description = "BigQuery dataset ID (underscores; e.g. signal_dev_analytics)."
}

variable "location" {
  type        = string
  description = "Dataset location (e.g. EU or europe-west1 — align with org policy)."
}

variable "labels" {
  type    = map(string)
  default = {}
}

variable "delete_contents_on_destroy" {
  type        = bool
  default     = false
  description = "If true, delete tables when dataset is destroyed (dev only)."
}
