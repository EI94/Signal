output "api_email" {
  value = google_service_account.api.email
}

output "ingest_email" {
  value = google_service_account.ingest.email
}

output "intel_email" {
  value = google_service_account.intel.email
}

output "scheduler_invoker_email" {
  value = google_service_account.scheduler_invoker.email
}

output "api_member" {
  value = "serviceAccount:${google_service_account.api.email}"
}

output "ingest_member" {
  value = "serviceAccount:${google_service_account.ingest.email}"
}

output "intel_member" {
  value = "serviceAccount:${google_service_account.intel.email}"
}

output "scheduler_invoker_member" {
  value = "serviceAccount:${google_service_account.scheduler_invoker.email}"
}
