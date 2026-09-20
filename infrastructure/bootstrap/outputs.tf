output "artifact_registry_repositories" {
  description = "Artifact Registry Docker repository paths by environment."
  value = {
    for environment, repository in google_artifact_registry_repository.environment_containers :
    environment => "${var.region}-docker.pkg.dev/${var.project_id}/${repository.repository_id}"
  }
}

output "deployer_service_accounts" {
  description = "GitHub Actions service account email addresses by environment."
  value = {
    for environment, account in google_service_account.ci_deployer :
    environment => account.email
  }
}

output "firestore_database_ids" {
  description = "Firestore database IDs assigned to each environment."
  value       = local.firestore_databases
}

output "environment_terraform_state_buckets" {
  description = "GCS buckets used by environment Terraform states."
  value = {
    for environment, bucket in google_storage_bucket.environment_state :
    environment => bucket.name
  }
}

output "workload_identity_providers" {
  description = "Full Workload Identity Provider resource names by environment."
  value = {
    for environment, provider in google_iam_workload_identity_pool_provider.github :
    environment => provider.name
  }
}
