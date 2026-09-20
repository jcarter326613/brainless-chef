import {
  for_each = local.firestore_databases

  to = google_service_account.migration_runtime[each.key]
  id = "projects/${var.project_id}/serviceAccounts/brainless-${each.key}-migrator@${var.project_id}.iam.gserviceaccount.com"
}
