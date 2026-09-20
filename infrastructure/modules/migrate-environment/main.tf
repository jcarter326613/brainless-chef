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
