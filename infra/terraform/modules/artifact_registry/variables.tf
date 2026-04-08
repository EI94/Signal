variable "project_id" {
  type = string
}

variable "environment" {
  type = string
}

variable "region" {
  type = string
}

variable "labels" {
  type    = map(string)
  default = {}
}

variable "create_repository" {
  type        = bool
  default     = true
  description = "Create Artifact Registry repo for Cloud Run images (recommended before first deploy)."
}
