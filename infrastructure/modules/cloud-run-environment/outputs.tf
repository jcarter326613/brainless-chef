output "web_url" {
  value = google_cloud_run_v2_service.web.uri
}

output "web_service_name" {
  value = google_cloud_run_v2_service.web.name
}

output "api_url" {
  value = google_cloud_run_v2_service.api.uri
}

output "api_service_name" {
  value = google_cloud_run_v2_service.api.name
}