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
        name  = "NODE_ENV"
        value = var.environment == "production" ? "production" : "development"
      }

      env {
        name  = "FIRESTORE_DATABASE_ID"
        value = var.firestore_database_id
      }

      env {
        name  = "WORKER_JOB_NAME"
        value = google_cloud_run_v2_job.worker.id
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

  depends_on = [google_cloud_run_v2_job_iam_member.api_worker_executor]
}

resource "google_cloud_run_v2_job" "worker" {
  name     = "brainless-chef-${var.environment}-worker"
  location = var.region
  project  = var.project_id

  template {
    task_count  = 1
    parallelism = 1

    template {
      service_account = var.worker_runtime_service_account_email
      timeout         = "900s"
      max_retries     = 0

      containers {
        name  = "worker"
        image = var.worker_image

        env {
          name  = "NODE_ENV"
          value = var.environment == "production" ? "production" : "development"
        }

        env {
          name  = "FIRESTORE_DATABASE_ID"
          value = var.firestore_database_id
        }

        resources {
          limits = {
            cpu    = "8"
            memory = "16Gi"
          }
        }
      }
    }
  }
}

resource "google_cloud_run_v2_job_iam_member" "api_worker_executor" {
  project  = var.project_id
  location = google_cloud_run_v2_job.worker.location
  name     = google_cloud_run_v2_job.worker.name
  role     = "roles/run.jobsExecutorWithOverrides"
  member   = "serviceAccount:${var.api_runtime_service_account_email}"
}

resource "google_cloud_run_v2_service_iam_member" "api_invoker" {
  for_each = toset(var.api_invoker_members)

  project  = var.project_id
  location = google_cloud_run_v2_service.api.location
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = each.value
}

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
