variable "project_id" {
  type = string
}

variable "environment" {
  type = string
}

variable "region" {
  type        = string
  description = "Cloud Tasks queue region (must match Cloud Run / HTTP targets later)."
}

variable "ingest_max_dispatches_per_second" {
  type    = number
  default = 500
}

variable "ingest_max_attempts" {
  type    = number
  default = 5
}

variable "intel_max_dispatches_per_second" {
  type    = number
  default = 500
}

variable "intel_max_attempts" {
  type    = number
  default = 5
}
