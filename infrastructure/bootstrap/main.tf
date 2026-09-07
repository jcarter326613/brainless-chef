provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  required_services = toset([
    "artifactregistry.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "dns.googleapis.com",
    "firestore.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "run.googleapis.com",
    "serviceusage.googleapis.com",
    "sts.googleapis.com",
    "storage.googleapis.com"
  ])

  firestore_databases = {
    development = "development"
    production  = "(default)"
  }
}

resource "google_project_service" "required" {
  for_each = local.required_services

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_storage_bucket" "terraform_state" {
  name                        = var.terraform_state_bucket_name
  location                    = var.region
  project                     = var.project_id
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning {
    enabled = true
  }

  # Retain the current state and a month of rollback history, not every apply forever.
  lifecycle_rule {
    action {
      type = "Delete"
    }

    condition {
      age        = 30
      with_state = "ARCHIVED"
    }
  }

  depends_on = [google_project_service.required]
}

resource "google_artifact_registry_repository" "containers" {
  location      = var.region
  repository_id = "brainless-chef"
  description   = "Brainless Chef Cloud Run container images"
  format        = "DOCKER"

  # Production retains three deployable releases; development artifacts are
  # short-lived because every main-branch deployment publishes a new image.
  cleanup_policies {
    id     = "keep-recent-production-api"
    action = "KEEP"

    most_recent_versions {
      keep_count            = 3
      package_name_prefixes = ["production/api"]
    }
  }

  cleanup_policies {
    id     = "keep-recent-production-web"
    action = "KEEP"

    most_recent_versions {
      keep_count            = 3
      package_name_prefixes = ["production/web"]
    }
  }

  cleanup_policies {
    id     = "delete-stale-development-images"
    action = "DELETE"

    condition {
      older_than            = "259200s"
      package_name_prefixes = ["development/"]
      tag_state             = "ANY"
    }
  }

  # KEEP policies above protect the three newest production versions before
  # this broad deletion policy is evaluated.
  cleanup_policies {
    id     = "delete-excess-production-images"
    action = "DELETE"

    condition {
      package_name_prefixes = ["production/"]
      tag_state             = "ANY"
    }
  }

  depends_on = [google_project_service.required]
}

data "google_dns_managed_zone" "website" {
  name    = var.dns_managed_zone_name
  project = var.project_id
}

resource "google_service_account" "ci_deployer" {
  account_id   = "brainless-chef-deployer"
  display_name = "Brainless Chef GitHub Actions deployer"
  description  = "Federated GitHub Actions identity for image publishing and Terraform deployment."

  depends_on = [google_project_service.required]
}

resource "google_service_account" "runtime" {
  for_each = toset(["development", "production"])

  account_id   = "brainless-chef-${each.value}"
  display_name = "Brainless Chef ${each.value} Cloud Run runtime"
  description  = "Runtime identity for the ${each.value} Cloud Run services."

  depends_on = [google_project_service.required]
}

# Keep the existing environment runtime identities for the web services. API
# services receive separate identities because they alone need database access.
resource "google_service_account" "api_runtime" {
  for_each = local.firestore_databases

  account_id   = "brainless-chef-${each.key}-api"
  display_name = "Brainless Chef ${each.key} API runtime"
  description  = "Firestore-enabled runtime identity for the ${each.key} Cloud Run API."

  depends_on = [google_project_service.required]
}

resource "google_project_iam_member" "deployer_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.ci_deployer.email}"
}

resource "google_project_iam_member" "deployer_artifact_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.ci_deployer.email}"
}

resource "google_project_iam_member" "deployer_service_usage" {
  project = var.project_id
  role    = "roles/serviceusage.serviceUsageConsumer"
  member  = "serviceAccount:${google_service_account.ci_deployer.email}"
}

resource "google_project_iam_custom_role" "deployer_dns_record_editor" {
  role_id     = "brainlessChefDnsRecordEditor"
  title       = "Brainless Chef DNS Record Editor"
  description = "Manages Cloud DNS record changes for the Brainless Chef website zone."
  permissions = [
    "dns.changes.create",
    "dns.changes.get",
    "dns.changes.list",
    "dns.managedZones.get",
    "dns.resourceRecordSets.create",
    "dns.resourceRecordSets.delete",
    "dns.resourceRecordSets.get",
    "dns.resourceRecordSets.list",
    "dns.resourceRecordSets.update"
  ]
  stage = "GA"

  depends_on = [google_project_service.required]
}

# The deployer can change records only in the existing production website zone.
resource "google_dns_managed_zone_iam_member" "deployer_dns_record_editor" {
  project      = var.project_id
  managed_zone = data.google_dns_managed_zone.website.name
  role         = google_project_iam_custom_role.deployer_dns_record_editor.name
  member       = "serviceAccount:${google_service_account.ci_deployer.email}"
}

resource "google_storage_bucket_iam_member" "deployer_terraform_state" {
  bucket = google_storage_bucket.terraform_state.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.ci_deployer.email}"
}

# The GCS backend reads bucket metadata before managing state objects.
resource "google_storage_bucket_iam_member" "deployer_terraform_state_reader" {
  bucket = google_storage_bucket.terraform_state.name
  role   = "roles/storage.legacyBucketReader"
  member = "serviceAccount:${google_service_account.ci_deployer.email}"
}

resource "google_service_account_iam_member" "deployer_runtime_user" {
  for_each = google_service_account.runtime

  service_account_id = each.value.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.ci_deployer.email}"
}

resource "google_service_account_iam_member" "deployer_api_runtime_user" {
  for_each = google_service_account.api_runtime

  service_account_id = each.value.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.ci_deployer.email}"
}

# Firestore evaluates server SDK authorization with IAM, not Security Rules.
# The condition confines each API identity to one database resource.
resource "google_project_iam_member" "api_runtime_firestore_user" {
  for_each = google_service_account.api_runtime

  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${each.value.email}"

  condition {
    title       = "${each.key}-firestore-only"
    description = "Allows the ${each.key} API to access only its Firestore database."
    expression  = "resource.name == 'projects/${var.project_id}/databases/${local.firestore_databases[each.key]}'"
  }
}

# Environment Terraform refreshes database configuration during every deploy,
# but CI cannot create, update, delete, or read Firestore documents.
resource "google_project_iam_custom_role" "deployer_firestore_database_reader" {
  role_id     = "brainlessChefFirestoreDatabaseReader"
  title       = "Brainless Chef Firestore Database Reader"
  description = "Reads Firestore database metadata for Terraform state refreshes."
  permissions = ["datastore.databases.getMetadata"]
  stage       = "GA"
}

resource "google_project_iam_member" "deployer_firestore_database_reader" {
  for_each = local.firestore_databases

  project = var.project_id
  role    = google_project_iam_custom_role.deployer_firestore_database_reader.name
  member  = "serviceAccount:${google_service_account.ci_deployer.email}"

  condition {
    title       = "${each.key}-firestore-database-metadata-only"
    description = "Allows Terraform to read ${each.key} Firestore database metadata only."
    expression  = "resource.name == 'projects/${var.project_id}/databases/${each.value}'"
  }
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "brainless-chef-github"
  display_name              = "Brainless Chef GitHub Actions"
  description               = "GitHub Actions OIDC identities for Brainless Chef."

  depends_on = [google_project_service.required]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub Actions"
  attribute_condition                = "assertion.repository == '${var.github_repository}'"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
  }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "github_workload_identity_user" {
  service_account_id = google_service_account.ci_deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}
