locals {
  prefix = "signal-${var.environment}"
}

resource "google_service_account" "api" {
  project      = var.project_id
  account_id   = "${local.prefix}-api"
  display_name = "Signal ${var.environment} — API (Cloud Run)"
}

resource "google_service_account" "ingest" {
  project      = var.project_id
  account_id   = "${local.prefix}-ingest"
  display_name = "Signal ${var.environment} — Ingest (Cloud Run)"
}

resource "google_service_account" "intel" {
  project      = var.project_id
  account_id   = "${local.prefix}-intel"
  display_name = "Signal ${var.environment} — Intel (Cloud Run)"
}

resource "google_service_account" "scheduler_invoker" {
  project      = var.project_id
  account_id   = "${local.prefix}-scheduler"
  display_name = "Signal ${var.environment} — Cloud Scheduler (invoker)"
}
