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
  default = "us-east1-docker.pkg.dev/brainlesschef/brainless-chef/production/web:latest"
}

variable "api_image" {
  type    = string
  default = "us-east1-docker.pkg.dev/brainlesschef/brainless-chef/production/api:latest"
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

variable "mailtrap_verification_txt" {
  description = "Mailtrap sending-domain verification TXT value for the apex domain."
  type        = string
  default     = ""
}

variable "mailtrap_dkim_selector" {
  description = "DKIM selector used by Mailtrap for the verified sending domain."
  type        = string
  default     = "mail"
}

variable "mailtrap_dkim_txt" {
  description = "Mailtrap-provided DKIM TXT value for the verified sending domain."
  type        = string
  default     = ""
}

variable "mailtrap_spf_txt" {
  description = "SPF TXT value authorizing Mailtrap to send for the apex domain."
  type        = string
  default     = ""
}

variable "mailtrap_dmarc_txt" {
  description = "DMARC TXT value for the apex domain."
  type        = string
  default     = ""
}
