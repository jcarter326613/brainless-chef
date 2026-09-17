output "migrate_queue_name" {
  description = "Production migration Cloud Tasks queue name."
  value       = module.migrate.migrate_queue_name
}

output "migrate_service_name" {
  description = "Production migrator Cloud Run service name."
  value       = module.migrate.migrate_service_name
}

output "migrate_service_url" {
  description = "Public HTTPS URL of the production migrator Cloud Run service."
  value       = module.migrate.migrate_service_url
}