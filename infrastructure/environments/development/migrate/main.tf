provider "google" {
  project = var.project_id
  region  = var.region
}

module "migrate" {
  source = "../../../modules/migrate-environment"

  environment                             = "development"
  project_id                              = var.project_id
  region                                  = var.region
  firestore_database_id                   = "development"
  migration_image                         = var.migration_image
  migration_runtime_service_account_email = "brainless-development-migrator@${var.project_id}.iam.gserviceaccount.com"
  deployer_service_account_email          = "brainless-chef-deployer@${var.project_id}.iam.gserviceaccount.com"
}