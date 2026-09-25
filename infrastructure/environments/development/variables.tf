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
  default = "us-east1-docker.pkg.dev/brainlesschef/brainless-chef-development/web:latest"
}

variable "api_image" {
  type    = string
  default = "us-east1-docker.pkg.dev/brainlesschef/brainless-chef-development/api:latest"
}

variable "site_origin" {
  type    = string
  default = "https://brainless-chef-development-web-3lfnvnepcq-ue.a.run.app"
}

variable "mailtrap_test_inbox_id" {
  description = "Mailtrap sandbox inbox ID for development email capture."
  type        = string
  default     = ""
}
