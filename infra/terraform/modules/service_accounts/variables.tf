variable "project_id" {
  type = string
}

variable "environment" {
  type        = string
  description = "Environment key: dev, staging, or prod."
}
