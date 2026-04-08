output "ingest_queue_id" {
  value = google_cloud_tasks_queue.ingest.id
}

output "intel_queue_id" {
  value = google_cloud_tasks_queue.intel.id
}
