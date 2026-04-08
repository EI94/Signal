terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.45"
    }
  }

  # Remote state: configure per org (GCS backend recommended). Local state is the default.
  # See ../README.md#remote-state
}
