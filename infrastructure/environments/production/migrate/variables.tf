variable "project_id" {
  type    = string
  default = "brainlesschef"
}

variable "region" {
  type    = string
  default = "us-east1"
}

variable "migration_image" {
  description = "Fully qualified migration container image reference."
  type        = string
}