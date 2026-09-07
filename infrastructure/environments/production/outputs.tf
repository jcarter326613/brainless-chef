output "api_url" {
  value = module.cloud_run.api_url
}

output "web_url" {
  value = module.cloud_run.web_url
}

output "website_domain_url" {
  value = "https://${var.website_domain}"
}

output "website_domain_mapping_status" {
  value = google_cloud_run_domain_mapping.website.status[0].conditions
}
