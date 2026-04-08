output "topic_names" {
  value = [for t in google_pubsub_topic.topic : t.name]
}

output "topic_ids" {
  value = { for k, t in google_pubsub_topic.topic : k => t.id }
}

output "intel_source_delta_subscription" {
  value = var.create_intel_source_delta_subscription ? google_pubsub_subscription.intel_source_delta_pull[0].name : null
}
