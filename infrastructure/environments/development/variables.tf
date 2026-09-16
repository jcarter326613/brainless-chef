variable "project_id" {
  type    = string
  default = "brainlesschef"
}

variable "region" {
  type    = string
  default = "us-east1"
}

variable "firestore_location_id" {
  description = "Firestore location. This cannot be changed after database creation."
  type        = string
  default     = "us-east1"
}

variable "web_image" {
  type    = string
  default = "us-east1-docker.pkg.dev/brainlesschef/brainless-chef/development/web:latest"
}

variable "mailtrap_api_token" {
  description = "Mailtrap API token for the development sandbox."
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "HMAC secret for development login and session tokens."
  type        = string
  sensitive   = true
}

variable "dns_managed_zone_name" {
  description = "Existing Cloud DNS zone that serves brainlesschef.com."
  type        = string
  default     = "brainlesschef-com"
}

variable "website_domain" {
  description = "Development subdomain mapped to the development web service."
  type        = string
  default     = "dev.brainlesschef.com"
}
