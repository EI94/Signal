variable "project_id" {
  type        = string
  description = "GCP project ID where APIs are enabled."
}

variable "services" {
  type        = list(string)
  description = "Service API names to enable (e.g. run.googleapis.com)."
}
