locals {
  site_origin = var.site_origin
}

resource "google_cloud_run_v2_service" "web" {
  name                 = "brainless-chef-${var.environment}-web"
  location             = var.region
  project              = var.project_id
  ingress              = "INGRESS_TRAFFIC_ALL"
  invoker_iam_disabled = true
  deletion_protection  = false

  template {
    service_account                  = var.web_runtime_service_account_email
    timeout                          = "60s"
    max_instance_request_concurrency = 80

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    containers {
      image = var.web_image

      ports {
        container_port = 8080
      }

      # The web container serves the static SPA and reverse-proxies /api to the
      # API service. It has no Firestore access and receives no application secrets.
      env {
        name  = "API_SERVICE_URL"
        value = google_cloud_run_v2_service.api.uri
      }

      resources {
        # Explicitly retain request-based billing when resource limits are set.
        cpu_idle          = true
        startup_cpu_boost = false

        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
  }

  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }

}

resource "google_cloud_run_v2_service" "api" {
  name                 = "brainless-chef-${var.environment}-api"
  location             = var.region
  project              = var.project_id
  ingress              = "INGRESS_TRAFFIC_ALL"
  invoker_iam_disabled = true
  deletion_protection  = false

  template {
    service_account                  = var.api_runtime_service_account_email
    timeout                          = "60s"
    max_instance_request_concurrency = 80

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    containers {
      image = var.api_image

      ports {
        container_port = 8080
      }

      env {
        name  = "FIRESTORE_DATABASE_ID"
        value = var.firestore_database_id
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }

      # Names the environment's Parameter Manager parameters so the API can
      # resolve its remaining configuration (site origin, mail settings) at
      # startup instead of receiving it as environment variables.
      env {
        name  = "APP_ENVIRONMENT"
        value = var.environment
      }

      env {
        name = "MAILTRAP_API_TOKEN"

        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.mailtrap.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "JWT_SECRET"

        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.jwt.secret_id
            version = "latest"
          }
        }
      }

      resources {
        # Explicitly retain request-based billing when resource limits are set.
        cpu_idle          = true
        startup_cpu_boost = false

        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
  }

  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }

  depends_on = [
    google_parameter_manager_parameter_version.site_origin,
    google_parameter_manager_parameter_version.mail_from,
    google_parameter_manager_parameter_version.mailtrap_mode
  ]
}

# Secrets are stored in Cloud Secret Manager and injected as Cloud Run env
# variables (value_source). Secret IDs are environment-qualified because both
# environments live in the same project. Secret versions are created by the
# deploy pipeline (gcloud secrets versions add), not by Terraform, so secret
# values never appear in Terraform state.
resource "google_secret_manager_secret" "mailtrap" {
  project   = var.project_id
  secret_id = "mailtrap-api-token-${var.environment}"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "jwt" {
  project   = var.project_id
  secret_id = "jwt-secret-${var.environment}"

  replication {
    auto {}
  }
}

# Non-secret API configuration lives in Cloud Parameter Manager so it is not
# baked into environment variables. Parameter IDs share an environment prefix
# so the runtime IAM condition can scope access to one environment.
resource "google_parameter_manager_parameter" "site_origin" {
  parameter_id = "${var.environment}-api-site-origin"

  lifecycle {
    create_before_destroy = true
  }
}

resource "google_parameter_manager_parameter_version" "site_origin" {
  parameter            = google_parameter_manager_parameter.site_origin.id
  parameter_version_id = format("v-%s", substr(sha256(local.site_origin), 0, 16))
  parameter_data       = local.site_origin

  lifecycle {
    create_before_destroy = true
  }
}

resource "google_parameter_manager_parameter" "mail_from" {
  parameter_id = "${var.environment}-api-mail-from"

  lifecycle {
    create_before_destroy = true
  }
}

resource "google_parameter_manager_parameter_version" "mail_from" {
  parameter            = google_parameter_manager_parameter.mail_from.id
  parameter_version_id = format("v-%s", substr(sha256(var.mail_from), 0, 16))
  parameter_data       = var.mail_from

  lifecycle {
    create_before_destroy = true
  }
}

resource "google_parameter_manager_parameter" "mailtrap_mode" {
  parameter_id = "${var.environment}-api-mailtrap-mode"

  lifecycle {
    create_before_destroy = true
  }
}

resource "google_parameter_manager_parameter_version" "mailtrap_mode" {
  parameter            = google_parameter_manager_parameter.mailtrap_mode.id
  parameter_version_id = format("v-%s", substr(sha256(var.mailtrap_mode), 0, 16))
  parameter_data       = var.mailtrap_mode

  lifecycle {
    create_before_destroy = true
  }
}

# The API runtime is the only runtime that reaches Firestore; the web runtime
# serves the SPA and proxies /api with no Firestore access. The API runtime's
# datastore.user membership is scoped to its one database by bootstrap.
