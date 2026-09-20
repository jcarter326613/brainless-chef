terraform {
  required_version = ">= 1.9.0"

  backend "gcs" {
    bucket = "brainlesschef-us-east1-production-terraform-state"
    prefix = "environment"
  }

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.45"
    }
  }
}
