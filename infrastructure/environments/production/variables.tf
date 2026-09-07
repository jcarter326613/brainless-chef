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
  default = "us-east1-docker.pkg.dev/brainlesschef/brainless-chef/api:latest"
}

variable "web_image" {
  type    = string
  default = "us-east1-docker.pkg.dev/brainlesschef/brainless-chef/web:latest"
}
