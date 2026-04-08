output "perplexity_secret_id" {
  value = var.create_placeholder_secrets ? google_secret_manager_secret.perplexity_api_key[0].secret_id : null
}

output "resend_secret_id" {
  value = var.create_placeholder_secrets ? google_secret_manager_secret.resend_api_key[0].secret_id : null
}

output "perplexity_secret_resource_id" {
  value = var.create_placeholder_secrets ? google_secret_manager_secret.perplexity_api_key[0].id : null
}

output "resend_secret_resource_id" {
  value = var.create_placeholder_secrets ? google_secret_manager_secret.resend_api_key[0].id : null
}
