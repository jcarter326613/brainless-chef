variable "project_id" {
  type    = string
  default = "brainlesschef"
}

variable "region" {
  type    = string
  default = "us-east1"
}

variable "api_image" {
  type    = string
  default = "us-east1-docker.pkg.dev/brainlesschef/brainless-chef/production/api:latest"
}

variable "web_image" {
  type    = string
  default = "us-east1-docker.pkg.dev/brainlesschef/brainless-chef/production/web:latest"
}

variable "dns_managed_zone_name" {
  description = "Existing Cloud DNS zone that serves the production website domain."
  type        = string
  default     = "brainlesschef-com"
}

variable "website_domain" {
  description = "Apex domain mapped only to the production web service."
  type        = string
  default     = "brainlesschef.com"
}
