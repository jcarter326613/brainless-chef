output "artifact_registry_repository" {
  description = "Artifact Registry Docker repository path."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.containers.repository_id}"
}

output "deployer_service_account" {
  description = "GitHub Actions service account email."
  value       = google_service_account.ci_deployer.email
}

output "firestore_database_ids" {
  description = "Firestore database IDs assigned to each environment."
  value       = local.firestore_databases
}

output "terraform_state_bucket" {
  description = "GCS bucket used by environment Terraform states."
  value       = google_storage_bucket.terraform_state.name
}

output "workload_identity_provider" {
  description = "Full Workload Identity Provider resource name for GitHub Actions."
  value       = google_iam_workload_identity_pool_provider.github.name
}
