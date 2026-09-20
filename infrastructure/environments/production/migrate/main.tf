provider "google" {
  project = var.project_id
  region  = var.region
}

module "migrate" {
  source = "../../../modules/migrate-environment"

  environment                             = "production"
  project_id                              = var.project_id
  region                                  = var.region
  firestore_database_id                   = "(default)"
  migration_image                         = var.migration_image
  migration_runtime_service_account_email = "brainless-production-migrator@${var.project_id}.iam.gserviceaccount.com"
}
