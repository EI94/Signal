variable "project_id" {
  type = string
}

variable "region" {
  type        = string
  description = "GCS bucket location (region)."
}

variable "bucket_name" {
  type        = string
  description = "Globally unique bucket name (include project prefix to avoid collisions)."
}

variable "labels" {
  type        = map(string)
  default     = {}
  description = "Bucket labels."
}

variable "versioning_enabled" {
  type        = bool
  default     = true
  description = "Enable object versioning for provenance / recovery (cost trade-off)."
}

variable "raw_archive_lifecycle_age_days" {
  type        = number
  default     = null
  description = "If set, delete objects older than this many days (null = no age-based delete)."
}

variable "force_destroy" {
  type        = bool
  default     = false
  description = "Allow Terraform to delete bucket with objects (dev only)."
}
