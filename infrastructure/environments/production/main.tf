provider "google" {
  project = var.project_id
  region  = var.region
}

resource "google_firestore_database" "database" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.firestore_location_id
  type        = "FIRESTORE_NATIVE"

  # Never delete recipe data as a side effect of Terraform state teardown.
  deletion_policy = "ABANDON"
}

data "google_dns_managed_zone" "website" {
  name    = var.dns_managed_zone_name
  project = var.project_id
}

module "cloud_run" {
  source = "../../modules/cloud-run-environment"

  environment                       = "production"
  project_id                        = var.project_id
  region                            = var.region
  web_runtime_service_account_email = "brainless-chef-production@${var.project_id}.iam.gserviceaccount.com"
  web_image                         = var.web_image
  firestore_database_id             = "(default)"
  site_origin                       = "https://brainlesschef.com"
  mail_from                         = "no-reply@brainlesschef.com"
  mailtrap_mode                     = "sending"
  mailtrap_api_token                = var.mailtrap_api_token
  jwt_secret                        = var.jwt_secret
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

# Records below verify brainlesschef.com as a Mailtrap sending domain and
# authorize Mailtrap to send as it. Values are account-specific and are
# populated from the Mailtrap dashboard; empty values create no records.
resource "google_dns_record_set" "mailtrap_verification" {
  count = var.mailtrap_verification_txt != "" ? 1 : 0

  managed_zone = data.google_dns_managed_zone.website.name
  name         = "${var.website_domain}."
  project      = var.project_id
  type         = "TXT"
  ttl          = 300
  rrdatas      = [var.mailtrap_verification_txt]
}

resource "google_dns_record_set" "mailtrap_dkim" {
  count = var.mailtrap_dkim_txt != "" ? 1 : 0

  managed_zone = data.google_dns_managed_zone.website.name
  name         = "${var.mailtrap_dkim_selector}._domainkey.${var.website_domain}."
  project      = var.project_id
  type         = "TXT"
  ttl          = 300
  rrdatas      = [var.mailtrap_dkim_txt]
}

resource "google_dns_record_set" "mailtrap_spf" {
  count = var.mailtrap_spf_txt != "" ? 1 : 0

  managed_zone = data.google_dns_managed_zone.website.name
  name         = "${var.website_domain}."
  project      = var.project_id
  type         = "TXT"
  ttl          = 300
  rrdatas      = [var.mailtrap_spf_txt]
}

resource "google_dns_record_set" "mailtrap_dmarc" {
  count = var.mailtrap_dmarc_txt != "" ? 1 : 0

  managed_zone = data.google_dns_managed_zone.website.name
  name         = "_dmarc.${var.website_domain}."
  project      = var.project_id
  type         = "TXT"
  ttl          = 300
  rrdatas      = [var.mailtrap_dmarc_txt]
}
