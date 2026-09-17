resource "google_cloud_run_v2_service" "web" {
  name     = "brainless-chef-${var.environment}-web"
  location = var.region
  project  = var.project_id
  ingress  = "INGRESS_TRAFFIC_ALL"

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

resource "google_cloud_run_v2_service_iam_member" "web_public_invoker" {
  project  = var.project_id
  location = google_cloud_run_v2_service.web.location
  name     = google_cloud_run_v2_service.web.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service" "api" {
  name     = "brainless-chef-${var.environment}-api"
  location = var.region
  project  = var.project_id
  ingress  = "INGRESS_TRAFFIC_ALL"

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
        name  = "SITE_ORIGIN"
        value = var.site_origin
      }

      env {
        name  = "MAIL_FROM"
        value = var.mail_from
      }

      env {
        name  = "MAILTRAP_MODE"
        value = var.mailtrap_mode
      }

      env {
        name = "MAILTRAP_API_TOKEN"

        value_source {
          secret_key_ref {
            secret = google_secret_manager_secret.mailtrap.secret_id
          }
        }
      }

      env {
        name = "JWT_SECRET"

        value_source {
          secret_key_ref {
            secret = google_secret_manager_secret.jwt.secret_id
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
}

resource "google_cloud_run_v2_service_iam_member" "api_public_invoker" {
  project  = var.project_id
  location = google_cloud_run_v2_service.api.location
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_secret_manager_secret" "mailtrap" {
  project   = var.project_id
  secret_id = "mailtrap-api-token"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "mailtrap" {
  secret      = google_secret_manager_secret.mailtrap.id
  secret_data = var.mailtrap_api_token
}

resource "google_secret_manager_secret_iam_member" "api_runtime_mailtrap_reader" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.mailtrap.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.api_runtime_service_account_email}"
}

resource "google_secret_manager_secret" "jwt" {
  project   = var.project_id
  secret_id = "jwt-secret"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "jwt" {
  secret      = google_secret_manager_secret.jwt.id
  secret_data = var.jwt_secret
}

resource "google_secret_manager_secret_iam_member" "api_runtime_jwt_reader" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.jwt.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.api_runtime_service_account_email}"
}

# The API runtime is the only runtime that reaches Firestore; the web runtime
# serves the SPA and proxies /api with no Firestore access. The API runtime's
# datastore.user membership is scoped to its one database by bootstrap.