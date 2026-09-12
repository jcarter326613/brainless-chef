output "api_url" {
  value = module.cloud_run.api_url
}

output "web_url" {
  value = module.cloud_run.web_url
}

output "worker_job_name" {
  value = module.cloud_run.worker_job_name
}
