variable "environment" {
  description = "Environment name used in migrator service and queue names."
  type        = string
}

variable "project_id" {
  description = "Google Cloud project ID."
  type        = string
}

variable "region" {
  description = "Google Cloud region for the migrator service and its task queue."
  type        = string
}

variable "firestore_database_id" {
  description = "Firestore database ID the migrator may access."
  type        = string
}

variable "migration_image" {
  description = "Fully qualified migration container image reference."
  type        = string
}

variable "migration_runtime_service_account_email" {
  description = "Pre-created least-privilege migrator identity with Firestore access."
  type        = string
}

variable "deployer_service_account_email" {
  description = "CI deployer identity allowed to enqueue migrations and poll status."
  type        = string
}