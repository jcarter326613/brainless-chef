variable "project_id" {
  description = "Google Cloud project to bootstrap."
  type        = string
  default     = "brainlesschef"
}

variable "region" {
  description = "Google Cloud region for regional resources."
  type        = string
  default     = "us-east1"
}

variable "terraform_state_bucket_name" {
  description = "Globally unique GCS bucket name for Terraform state."
  type        = string
  default     = "brainlesschef-us-east1-terraform-state"
}

variable "github_repository" {
  description = "GitHub owner/repository authorized to deploy."
  type        = string
  default     = "jcarter326613/brainless-chef"
}

variable "dns_managed_zone_name" {
  description = "Existing Cloud DNS managed zone for the production website domain."
  type        = string
  default     = "brainlesschef-com"
}
