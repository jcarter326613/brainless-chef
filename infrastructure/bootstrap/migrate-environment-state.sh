#!/usr/bin/env bash
set -euo pipefail

project_id="brainlesschef"
region="us-east1"
old_state_bucket="brainlesschef-us-east1-terraform-state"
root_dir="$(git rev-parse --show-toplevel)"
bootstrap_dir="${root_dir}/infrastructure/bootstrap"
project_number="$(gcloud projects describe "${project_id}" --format='value(projectNumber)')"

has_state() {
  local directory="$1"
  local address="$2"
  local managed_resource

  while IFS= read -r managed_resource; do
    if [[ "${managed_resource}" == "${address}" ]]; then
      return 0
    fi
  done < <(terraform -chdir="${directory}" state list)

  return 1
}

remove_state() {
  local directory="$1"
  local address="$2"

  if has_state "${directory}" "${address}"; then
    terraform -chdir="${directory}" state rm "${address}"
  fi
}

import_bootstrap() {
  local address="$1"
  local id="$2"

  if ! has_state "${bootstrap_dir}" "${address}"; then
    terraform -chdir="${bootstrap_dir}" import "${address}" "${id}"
  fi
}

migrate_backend() {
  local directory="$1"
  local old_prefix="$2"
  local new_bucket="$3"
  local new_prefix="$4"

  if gcloud storage ls "gs://${new_bucket}/${new_prefix}/default.tfstate" >/dev/null 2>&1; then
    return
  fi

  terraform -chdir="${directory}" init -reconfigure -input=false
  gcloud storage cp --if-generation-match=0 \
    "gs://${old_state_bucket}/${old_prefix}/default.tfstate" \
    "gs://${new_bucket}/${new_prefix}/default.tfstate"
}

terraform -chdir="${bootstrap_dir}" init -input=false
terraform -chdir="${bootstrap_dir}" apply -input=false -auto-approve \
  -target=google_service_account.ci_deployer \
  -target=google_storage_bucket.environment_state \
  -target=google_storage_bucket_iam_member.deployer_environment_state \
  -target=google_storage_bucket_iam_member.deployer_environment_state_reader

for environment in development production; do
  environment_dir="${root_dir}/infrastructure/environments/${environment}"
  migrate_dir="${environment_dir}/migrate"

  state_bucket="${project_id}-${region}-${environment}-terraform-state"
  migrate_backend "${environment_dir}" "environments/${environment}" "${state_bucket}" "environment"
  migrate_backend "${migrate_dir}" "environments/${environment}/migrate" "${state_bucket}" "migrate"

  queue_id="projects/${project_id}/locations/${region}/queues/brainless-chef-${environment}-migrate"
  if gcloud tasks queues describe "brainless-chef-${environment}-migrate" \
    --project="${project_id}" \
    --location="${region}" >/dev/null 2>&1; then
    import_bootstrap "google_cloud_tasks_queue.migration[\"${environment}\"]" "${queue_id}"
  fi

  if has_state "${migrate_dir}" "module.migrate.google_service_account_iam_member.cloud_tasks_token_creator"; then
    import_bootstrap \
      "google_service_account_iam_member.cloud_tasks_token_creator[\"${environment}\"]" \
      "projects/${project_id}/serviceAccounts/brainless-${environment}-migrator@${project_id}.iam.gserviceaccount.com/roles/iam.serviceAccountTokenCreator/serviceAccount:service-${project_number}@gcp-sa-cloudtasks.iam.gserviceaccount.com"
  fi

  if has_state "${environment_dir}" "module.cloud_run.google_project_iam_member.api_runtime_parameter_reader"; then
    import_bootstrap \
      "google_project_iam_member.api_runtime_parameter_reader[\"${environment}\"]" \
      "${project_id}/roles/parametermanager.viewer/serviceAccount:brainless-chef-${environment}-api@${project_id}.iam.gserviceaccount.com"
  fi

  remove_state "${environment_dir}" "module.cloud_run.google_cloud_run_v2_service_iam_member.web_public_invoker"
  remove_state "${environment_dir}" "module.cloud_run.google_cloud_run_v2_service_iam_member.api_public_invoker"
  remove_state "${environment_dir}" "module.cloud_run.google_secret_manager_secret_iam_member.api_runtime_mailtrap_reader"
  remove_state "${environment_dir}" "module.cloud_run.google_secret_manager_secret_iam_member.api_runtime_jwt_reader"
  remove_state "${environment_dir}" "module.cloud_run.google_project_iam_member.api_runtime_parameter_reader"

  if [[ "${environment}" == "development" ]]; then
    remove_state "${environment_dir}" "google_cloud_run_domain_mapping.website"
    remove_state "${environment_dir}" "google_dns_record_set.website_ipv4"
    remove_state "${environment_dir}" "google_dns_record_set.website_ipv6"
  fi

  remove_state "${migrate_dir}" "module.migrate.google_cloud_tasks_queue.migrate"
  remove_state "${migrate_dir}" "module.migrate.google_cloud_tasks_queue_iam_member.deployer_enqueuer"
  remove_state "${migrate_dir}" "module.migrate.google_service_account_iam_member.cloud_tasks_token_creator"
  remove_state "${migrate_dir}" "module.migrate.google_cloud_run_v2_service_iam_member.migrate_deployer_invoker"
  remove_state "${migrate_dir}" "module.migrate.google_cloud_run_v2_service_iam_member.migrate_migrator_invoker"
done

terraform -chdir="${bootstrap_dir}" apply -input=false -auto-approve

for environment in development production; do
  terraform -chdir="${root_dir}/infrastructure/environments/${environment}" plan -input=false
  terraform -chdir="${root_dir}/infrastructure/environments/${environment}/migrate" plan -input=false \
    -var="migration_image=${region}-docker.pkg.dev/${project_id}/brainless-chef-${environment}/migration:latest"
done
