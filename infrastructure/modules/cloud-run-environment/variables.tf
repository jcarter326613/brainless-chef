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

variable "api_runtime_service_account_email" {
  description = "Pre-created least-privilege Cloud Run API runtime identity with Firestore access."
  type        = string
}

variable "web_image" {
  description = "Fully qualified web container image reference."
  type        = string
}

variable "api_image" {
  description = "Fully qualified API container image reference."
  type        = string
}

variable "firestore_database_id" {
  description = "Firestore database ID the API runtime may access."
  type        = string
}

variable "site_origin" {
  description = "Public origin of this environment's web service, used to build absolute login-link URLs."
  type        = string
}

variable "mail_from" {
  description = "From address for transactional email."
  type        = string
}

variable "mailtrap_mode" {
  description = "Mailtrap client mode: \"sending\" for real delivery or \"sandbox\" to capture test mail."
  type        = string
}

variable "mailtrap_api_token" {
  description = "Mailtrap API token, stored as a Secret Manager version."
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "HMAC secret for login and session tokens, stored as a Secret Manager version."
  type        = string
  sensitive   = true
}
