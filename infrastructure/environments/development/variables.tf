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

variable "api_image" {
  type    = string
  default = "us-east1-docker.pkg.dev/brainlesschef/brainless-chef/development/api:latest"
}

variable "web_image" {
  type    = string
  default = "us-east1-docker.pkg.dev/brainlesschef/brainless-chef/development/web:latest"
}

variable "api_invoker_members" {
  description = "Users, groups, or service accounts allowed to invoke the private development API."
  type        = list(string)
  default     = []
}

variable "worker_image" {
  type    = string
  default = "us-east1-docker.pkg.dev/brainlesschef/brainless-chef/development/worker:latest"
}
