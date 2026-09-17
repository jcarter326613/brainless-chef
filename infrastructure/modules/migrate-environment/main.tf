data "google_project" "project" {
  project_id = var.project_id
}

# One queue per environment. PUSH queues dispatches are serialized so a given
# environment never runs two migrations concurrently; retries are disabled to
# match the forward-only migration contract (a failed migration fails loudly).
resource "google_cloud_tasks_queue" "migrate" {
  name     = "brainless-chef-${var.environment}-migrate"
  project  = var.project_id
  location = var.region

  rate_limits {
    max_concurrent_dispatches = 1
    max_dispatches_per_second = 1
  }

  retry_config {
    max_attempts = 1
  }
}

# CI enqueues migration tasks on the environment queue.
resource "google_cloud_tasks_queue_iam_member" "deployer_enqueuer" {
  project  = var.project_id
  location = google_cloud_tasks_queue.migrate.location
  name     = google_cloud_tasks_queue.migrate.name
  role     = "roles/cloudtasks.enqueuer"
  member   = "serviceAccount:${var.deployer_service_account_email}"
}

# The Cloud Tasks service agent mints the OIDC token presented to the migrator
# service, using the migrator identity as the token subject.
resource "google_service_account_iam_member" "cloud_tasks_token_creator" {
  service_account_id = "projects/${var.project_id}/serviceAccounts/${var.migration_runtime_service_account_email}"
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${data.google_project.project.number}@gcp-sa-cloudtasks.iam.gserviceaccount.com"
}

resource "google_cloud_run_v2_service" "migrate" {
  name     = "brainless-chef-${var.environment}-migrate"
  location = var.region
  project  = var.project_id
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account                  = var.migration_runtime_service_account_email
    timeout                          = "3600s"
    max_instance_request_concurrency = 1

    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }

    containers {
      image = var.migration_image

      ports {
        container_port = 8080
      }

      env {
        name  = "FIRESTORE_DATABASE_ID"
        value = var.firestore_database_id
      }

      resources {
        # Request-based billing: CPU is allocated only while a migration request
        # is processed, so short migrations bill at sub-minute precision with no
        # Cloud Run Job minimum.
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

# No allUsers invoker. The migrator identity reaches the service through the
# Cloud Tasks OIDC token; the CI deployer polls migration status directly.
resource "google_cloud_run_v2_service_iam_member" "migrate_migrator_invoker" {
  project  = var.project_id
  location = google_cloud_run_v2_service.migrate.location
  name     = google_cloud_run_v2_service.migrate.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.migration_runtime_service_account_email}"
}

resource "google_cloud_run_v2_service_iam_member" "migrate_deployer_invoker" {
  project  = var.project_id
  location = google_cloud_run_v2_service.migrate.location
  name     = google_cloud_run_v2_service.migrate.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.deployer_service_account_email}"
}