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
            secret = google_secret_manager_secret.web_mailtrap.secret_id
          }
        }
      }

      env {
        name = "JWT_SECRET"

        value_source {
          secret_key_ref {
            secret = google_secret_manager_secret.web_jwt.secret_id
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

resource "google_cloud_run_v2_service_iam_member" "web_public_invoker" {
  project  = var.project_id
  location = google_cloud_run_v2_service.web.location
  name     = google_cloud_run_v2_service.web.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_secret_manager_secret" "web_mailtrap" {
  project   = var.project_id
  secret_id = "web-mailtrap-api-token"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "web_mailtrap" {
  secret      = google_secret_manager_secret.web_mailtrap.id
  secret_data = var.mailtrap_api_token
}

resource "google_secret_manager_secret_iam_member" "web_runtime_mailtrap_reader" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.web_mailtrap.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.web_runtime_service_account_email}"
}

resource "google_secret_manager_secret" "web_jwt" {
  project   = var.project_id
  secret_id = "web-jwt-secret"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "web_jwt" {
  secret      = google_secret_manager_secret.web_jwt.id
  secret_data = var.jwt_secret
}

resource "google_secret_manager_secret_iam_member" "web_runtime_jwt_reader" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.web_jwt.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.web_runtime_service_account_email}"
}

# Firestore IAM cannot target collections inside a database, so the web runtime
# is scoped to the one database its environment owns. No current API endpoint
# reads recipe data; data-reading endpoints must implement per-user
# authorization before they ship.
resource "google_project_iam_member" "web_runtime_firestore_user" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${var.web_runtime_service_account_email}"

  condition {
    title       = "${var.environment}-web-firestore-only"
    description = "Allows the ${var.environment} web runtime to access only its Firestore database."
    expression  = "resource.name == 'projects/${var.project_id}/databases/${var.firestore_database_id}'"
  }
}
