# Bootstrap

This directory creates project-wide resources and stores its Terraform state in the versioned GCS bucket `brainlesschef-us-east1-terraform-state` under the `bootstrap` prefix. Local Terraform state is prohibited. Do not run `terraform apply`, `terraform import`, or any other stateful Terraform command with the backend disabled.

The backend bucket must exist before Terraform can initialize a new project. A trusted administrator creates that single prerequisite directly with Google Cloud CLI, then imports it into the remote bootstrap state:

```sh
gcloud auth login
gcloud config set project brainlesschef
gcloud auth application-default login
gcloud auth application-default set-quota-project brainlesschef
```

```sh
gcloud services enable storage.googleapis.com --project=brainlesschef
gcloud storage buckets create gs://brainlesschef-us-east1-terraform-state \
  --project=brainlesschef \
  --location=us-east1 \
  --uniform-bucket-level-access \
  --public-access-prevention
gcloud storage buckets update gs://brainlesschef-us-east1-terraform-state --versioning
terraform init
terraform import google_storage_bucket.terraform_state brainlesschef-us-east1-terraform-state
terraform apply
```

Run the bucket creation and import commands only for a new project with no existing bootstrap state. For an established project, initialize the configured backend and inspect the remote state before applying:

```sh
terraform init
terraform state list
terraform plan
terraform apply
```

When upgrading an established project to isolated environment deployers and state buckets, pause deployments and run `bash infrastructure/bootstrap/migrate-environment-state.sh` from the repository root. The script performs the required backend and resource-state transition with the configured remote backends; do not run individual state commands yourself.

After initialization, bootstrap state must exist only at `gs://brainlesschef-us-east1-terraform-state/bootstrap/default.tfstate`. The bucket has object versioning and Terraform deletion protection. Never copy bootstrap state into the repository or use local state as a fallback; recover an earlier generation from GCS object history instead.

Record the `deployer_service_accounts` and `workload_identity_providers` outputs in GitHub Environments, not repository-wide variables. Set `GCP_DEPLOYER_SERVICE_ACCOUNT` and `GCP_WORKLOAD_IDENTITY_PROVIDER` in the `development` Environment from the development values, and set the same variable names in the protected `production` Environment from the production values.

Bootstrap state remains in `brainlesschef-us-east1-terraform-state`. Environment state is isolated in `brainlesschef-us-east1-development-terraform-state` and `brainlesschef-us-east1-production-terraform-state`; their names are hard-coded in the environment `versions.tf` files because backend configuration cannot use Terraform variables.

Only the production deployer receives the custom DNS role for the existing `brainlesschef-com` zone. Before applying the production custom-domain configuration, add `brainless-chef-production-deployer@brainlesschef.iam.gserviceaccount.com` as a verified owner of `brainlesschef.com` in Google Search Console. This is domain-verification access, not a Google Cloud project-owner role.
