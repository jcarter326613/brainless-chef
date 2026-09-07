provider "google" {
  project = var.project_id
  region  = var.region
}

module "cloud_run" {
  source = "../../modules/cloud-run-environment"

  api_image                     = var.api_image
  environment                   = "development"
  project_id                    = var.project_id
  region                        = var.region
  runtime_service_account_email = "brainless-chef-development@${var.project_id}.iam.gserviceaccount.com"
  web_image                     = var.web_image
}
