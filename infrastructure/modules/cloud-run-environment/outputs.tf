output "api_url" {
  value = google_cloud_run_v2_service.api.uri
}

output "web_url" {
  value = google_cloud_run_v2_service.web.uri
}

output "web_service_name" {
  value = google_cloud_run_v2_service.web.name
}

output "worker_job_name" {
  value = google_cloud_run_v2_job.worker.id
}
