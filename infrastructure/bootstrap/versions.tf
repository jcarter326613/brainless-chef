terraform {
  required_version = ">= 1.9.0"

  backend "gcs" {
    bucket = "brainlesschef-us-east1-terraform-state"
    prefix = "bootstrap"
  }

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.45"
    }
  }
}
