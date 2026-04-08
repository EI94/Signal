resource "google_pubsub_topic" "topic" {
  for_each = toset(var.topic_names)

  name    = each.value
  project = var.project_id

  labels = var.labels
}

resource "google_pubsub_subscription" "intel_source_delta_pull" {
  count = var.create_intel_source_delta_subscription ? 1 : 0

  name  = "signal-${var.environment}-intel-source-delta-pull"
  topic = google_pubsub_topic.topic["source.delta.detected"].name

  project = var.project_id

  ack_deadline_seconds       = 60
  message_retention_duration = "86400s"

  labels = var.labels

  depends_on = [google_pubsub_topic.topic]
}
