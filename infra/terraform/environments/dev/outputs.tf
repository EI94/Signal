output "service_account_emails" {
  description = "Runtime service accounts for Cloud Run (use as runtime SA later)."
  value = {
    api               = module.service_accounts.api_email
    ingest            = module.service_accounts.ingest_email
    intel             = module.service_accounts.intel_email
    scheduler_invoker = module.service_accounts.scheduler_invoker_email
  }
}

output "raw_archive_bucket" {
  value = module.storage.raw_archive_bucket_name
}

output "bigquery_dataset" {
  value = module.bigquery.dataset_id
}

output "pubsub_topics" {
  value = module.pubsub.topic_names
}

output "cloud_tasks_queues" {
  value = {
    ingest = module.tasks.ingest_queue_id
    intel  = module.tasks.intel_queue_id
  }
}

output "artifact_registry_url" {
  value = module.artifact_registry.repository_url
}

output "firestore_database" {
  value = module.firestore.database_id
}
