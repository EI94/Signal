variable "project_id" {
  type = string
}

variable "environment" {
  type = string
}

variable "topic_names" {
  type        = list(string)
  description = "Pub/Sub topic names (aligned with architecture docs)."
}

variable "labels" {
  type    = map(string)
  default = {}
}

variable "create_intel_source_delta_subscription" {
  type        = bool
  default     = true
  description = "Create pull subscription for services/intel on source.delta.detected."
}
