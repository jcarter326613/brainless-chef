provider "google" {
  project = var.project_id
  region  = var.region
}

data "google_dns_managed_zone" "website" {
  name    = var.dns_managed_zone_name
  project = var.project_id
}

module "cloud_run" {
  source = "../../modules/cloud-run-environment"

  api_image                     = var.api_image
  environment                   = "production"
  project_id                    = var.project_id
  region                        = var.region
  runtime_service_account_email = "brainless-chef-production@${var.project_id}.iam.gserviceaccount.com"
  web_image                     = var.web_image
}

# This mapping exists only in production, so the apex domain never points at
# a development service. Cloud Run provisions and renews the TLS certificate.
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

# Cloud Run supplies the current apex records as part of the mapping status.
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
