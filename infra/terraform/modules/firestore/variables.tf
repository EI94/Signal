variable "project_id" {
  type = string
}

variable "location_id" {
  type        = string
  description = "Firestore location (regional e.g. europe-west1, or multi-region e.g. eur3). Must match org policy."
}

variable "manage_firestore_database" {
  type        = bool
  default     = true
  description = "If false, skip creating the default database (use when DB already exists — import or manual)."
}
