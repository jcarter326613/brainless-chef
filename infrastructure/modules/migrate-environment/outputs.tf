output "migrate_queue_name" {
  description = "Environment migration Cloud Tasks queue name."
  value       = "brainless-chef-${var.environment}-migrate"
}

output "migrate_service_name" {
  description = "Migrator Cloud Run service name."
  value       = google_cloud_run_v2_service.migrate.name
}

output "migrate_service_url" {
  description = "Public HTTPS URL of the migrator Cloud Run service."
  value       = google_cloud_run_v2_service.migrate.uri
}
