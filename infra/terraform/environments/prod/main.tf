module "project_services" {
  source = "../../modules/project_services"

  project_id = var.project_id
  services   = local.enabled_apis
}

module "service_accounts" {
  source = "../../modules/service_accounts"

  project_id  = var.project_id
  environment = var.environment

  depends_on = [module.project_services]
}

module "firestore" {
  source = "../../modules/firestore"

  project_id                = var.project_id
  location_id               = var.firestore_location_id
  manage_firestore_database = var.manage_firestore_database

  depends_on = [module.project_services]
}

module "storage" {
  source = "../../modules/storage"

  project_id                     = var.project_id
  region                         = var.region
  bucket_name                    = local.raw_bucket_name
  labels                         = local.default_labels
  force_destroy                  = var.raw_bucket_force_destroy
  raw_archive_lifecycle_age_days = var.raw_archive_lifecycle_age_days

  depends_on = [module.project_services]
}

module "bigquery" {
  source = "../../modules/bigquery"

  project_id                 = var.project_id
  environment                = var.environment
  dataset_id                 = local.bq_dataset_id
  location                   = var.bigquery_location
  labels                     = local.default_labels
  delete_contents_on_destroy = var.bq_delete_contents_on_destroy

  depends_on = [module.project_services]
}

module "pubsub" {
  source = "../../modules/pubsub"

  project_id                             = var.project_id
  environment                            = var.environment
  topic_names                            = local.pubsub_topics
  labels                                 = local.default_labels
  create_intel_source_delta_subscription = var.create_intel_pubsub_subscription

  depends_on = [module.project_services]
}

module "tasks" {
  source = "../../modules/tasks"

  project_id  = var.project_id
  environment = var.environment
  region      = var.region

  depends_on = [module.project_services]
}

module "secrets" {
  source = "../../modules/secrets"

  project_id                 = var.project_id
  environment                = var.environment
  labels                     = local.default_labels
  create_placeholder_secrets = var.create_placeholder_secrets

  depends_on = [module.project_services]
}

module "artifact_registry" {
  source = "../../modules/artifact_registry"

  project_id        = var.project_id
  environment       = var.environment
  region            = var.region
  labels            = local.default_labels
  create_repository = var.create_artifact_registry

  depends_on = [module.project_services]
}

# --- IAM: minimal bindings for resources provisioned above ---

resource "google_project_iam_member" "api_datastore_user" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = module.service_accounts.api_member
}

resource "google_storage_bucket_iam_member" "ingest_object_admin" {
  bucket = module.storage.raw_archive_bucket_name
  role   = "roles/storage.objectAdmin"
  member = module.service_accounts.ingest_member
}

resource "google_storage_bucket_iam_member" "intel_object_viewer" {
  bucket = module.storage.raw_archive_bucket_name
  role   = "roles/storage.objectViewer"
  member = module.service_accounts.intel_member
}

resource "google_bigquery_dataset_iam_member" "ingest_bq_editor" {
  dataset_id = module.bigquery.dataset_id
  project    = var.project_id
  role       = "roles/bigquery.dataEditor"
  member     = module.service_accounts.ingest_member
}

resource "google_bigquery_dataset_iam_member" "intel_bq_editor" {
  dataset_id = module.bigquery.dataset_id
  project    = var.project_id
  role       = "roles/bigquery.dataEditor"
  member     = module.service_accounts.intel_member
}

resource "google_bigquery_dataset_iam_member" "api_bq_viewer" {
  dataset_id = module.bigquery.dataset_id
  project    = var.project_id
  role       = "roles/bigquery.dataViewer"
  member     = module.service_accounts.api_member
}

resource "google_pubsub_topic_iam_member" "ingest_publish_source_delta" {
  project = var.project_id
  topic   = "source.delta.detected"
  role    = "roles/pubsub.publisher"
  member  = module.service_accounts.ingest_member
}

resource "google_pubsub_topic_iam_member" "intel_publish_signal_scored" {
  project = var.project_id
  topic   = "signal.scored"
  role    = "roles/pubsub.publisher"
  member  = module.service_accounts.intel_member
}

resource "google_pubsub_topic_iam_member" "intel_publish_alert_triggered" {
  project = var.project_id
  topic   = "alert.triggered"
  role    = "roles/pubsub.publisher"
  member  = module.service_accounts.intel_member
}

resource "google_pubsub_subscription_iam_member" "intel_subscribe_source_delta" {
  count = var.create_intel_pubsub_subscription ? 1 : 0

  project      = var.project_id
  subscription = module.pubsub.intel_source_delta_subscription
  role         = "roles/pubsub.subscriber"
  member       = module.service_accounts.intel_member
}

resource "google_secret_manager_secret_iam_member" "intel_perplexity_accessor" {
  count = var.create_placeholder_secrets ? 1 : 0

  project   = var.project_id
  secret_id = module.secrets.perplexity_secret_resource_id
  role      = "roles/secretmanager.secretAccessor"
  member    = module.service_accounts.intel_member
}

resource "google_secret_manager_secret_iam_member" "api_resend_accessor" {
  count = var.create_placeholder_secrets ? 1 : 0

  project   = var.project_id
  secret_id = module.secrets.resend_secret_resource_id
  role      = "roles/secretmanager.secretAccessor"
  member    = module.service_accounts.api_member
}
