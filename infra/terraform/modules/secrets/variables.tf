variable "project_id" {
  type = string
}

variable "environment" {
  type = string
}

variable "labels" {
  type    = map(string)
  default = {}
}

variable "create_placeholder_secrets" {
  type        = bool
  default     = true
  description = "Create empty Secret Manager secrets (no versions). Disable when not using Secret Manager yet."
}
