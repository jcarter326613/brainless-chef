provider "google" {
  project = var.project_id
  region  = var.region
}

resource "google_firestore_database" "database" {
  project     = var.project_id
  name        = "development"
  location_id = var.firestore_location_id
  type        = "FIRESTORE_NATIVE"

  # Never delete recipe data as a side effect of Terraform state teardown.
  deletion_policy = "ABANDON"
}

module "cloud_run" {
  source = "../../modules/cloud-run-environment"

  api_image                            = var.api_image
  api_invoker_members                  = var.api_invoker_members
  api_runtime_service_account_email    = "brainless-chef-development-api@${var.project_id}.iam.gserviceaccount.com"
  environment                          = "development"
  firestore_database_id                = google_firestore_database.database.name
  project_id                           = var.project_id
  region                               = var.region
  web_runtime_service_account_email    = "brainless-chef-development@${var.project_id}.iam.gserviceaccount.com"
  web_image                            = var.web_image
  worker_image                         = var.worker_image
  worker_runtime_service_account_email = "brainless-development-worker@${var.project_id}.iam.gserviceaccount.com"
}
