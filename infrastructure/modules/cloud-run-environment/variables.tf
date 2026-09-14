variable "environment" {
  description = "Environment name used in service names."
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
