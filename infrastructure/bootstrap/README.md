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

After initialization, bootstrap state must exist only at `gs://brainlesschef-us-east1-terraform-state/bootstrap/default.tfstate`. The bucket has object versioning and Terraform deletion protection. Never copy bootstrap state into the repository or use local state as a fallback; recover an earlier generation from GCS object history instead.

Record the `deployer_service_account` and `workload_identity_provider` outputs as GitHub Actions repository variables named `GCP_DEPLOYER_SERVICE_ACCOUNT` and `GCP_WORKLOAD_IDENTITY_PROVIDER`.

The state bucket is `brainlesschef-us-east1-terraform-state` by default. If its name is changed, update the hard-coded GCS backend in the bootstrap, development, and production `versions.tf` files before initializing any stack. Backend configuration cannot use Terraform variables.

The deployer receives a custom role bound only to the existing `brainlesschef-com` DNS zone. It can manage record sets and DNS changes in that zone, but cannot administer any other zone or project DNS configuration. Before applying the production custom-domain configuration, add `brainless-chef-deployer@brainlesschef.iam.gserviceaccount.com` as a verified owner of `brainlesschef.com` in Google Search Console. This is domain-verification access, not a Google Cloud project-owner role.
