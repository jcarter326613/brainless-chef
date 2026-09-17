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

  environment                       = "development"
  project_id                        = var.project_id
  region                            = var.region
  web_runtime_service_account_email = "brainless-chef-development@${var.project_id}.iam.gserviceaccount.com"
  api_runtime_service_account_email = "brainless-chef-development-api@${var.project_id}.iam.gserviceaccount.com"
  web_image                         = var.web_image
  api_image                         = var.api_image
  firestore_database_id             = "development"
  site_origin                       = "https://dev.brainlesschef.com"
  mail_from                         = "no-reply@brainlesschef.com"
  mailtrap_mode                     = "sandbox"
  mailtrap_api_token                = var.mailtrap_api_token
  jwt_secret                        = var.jwt_secret
}

data "google_dns_managed_zone" "website" {
  name    = var.dns_managed_zone_name
  project = var.project_id
}

# Development is mapped only to its subdomain, so it never serves the apex
# domain. Cloud Run provisions and renews the TLS certificate.
resource "google_cloud_run_domain_mapping" "website" {
  name     = var.website_domain
  location = var.region
  project  = var.project_id

  metadata {
    namespace = var.project_id
  }

  spec {
    certificate_mode = "AUTOMATIC"
    route_name       = module.cloud_run.web_service_name
  }
}

resource "google_dns_record_set" "website_ipv4" {
  managed_zone = data.google_dns_managed_zone.website.name
  name         = "${var.website_domain}."
  project      = var.project_id
  type         = "A"
  ttl          = 300
  rrdatas = [
    for record in google_cloud_run_domain_mapping.website.status[0].resource_records : record.rrdata
    if record.type == "A"
  ]
}

resource "google_dns_record_set" "website_ipv6" {
  managed_zone = data.google_dns_managed_zone.website.name
  name         = "${var.website_domain}."
  project      = var.project_id
  type         = "AAAA"
  ttl          = 300
  rrdatas = [
    for record in google_cloud_run_domain_mapping.website.status[0].resource_records : record.rrdata
    if record.type == "AAAA"
  ]
}