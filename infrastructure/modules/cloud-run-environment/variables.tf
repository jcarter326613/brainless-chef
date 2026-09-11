variable "api_image" {
  description = "Fully qualified API container image reference."
  type        = string
}

variable "api_runtime_service_account_email" {
  description = "Pre-created API runtime identity with access only to this environment's database."
  type        = string
}

variable "environment" {
  description = "Environment name used in service names."
  type        = string
}

variable "firestore_database_id" {
  description = "Firestore database ID available to the API service."
  type        = string
}

variable "project_id" {
  description = "Google Cloud project ID."
  type        = string
}

variable "region" {
  description = "Cloud Run region."
  type        = string
}

variable "web_runtime_service_account_email" {
  description = "Pre-created least-privilege Cloud Run web runtime identity."
  type        = string
}

variable "web_image" {
  description = "Fully qualified web container image reference."
  type        = string
}

variable "api_invoker_members" {
  description = "IAM members allowed to invoke the private API service."
  type        = list(string)
  default     = []
}

variable "worker_image" {
  description = "Fully qualified recipe inference worker container image reference."
  type        = string
}

variable "worker_runtime_service_account_email" {
  description = "Pre-created worker identity with access only to this environment's database."
  type        = string
}
