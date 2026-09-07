# Infrastructure Operations

## Layout

- `infrastructure/bootstrap`: project-wide APIs, Artifact Registry, Terraform-state bucket, service accounts, and GitHub OIDC federation. Its Terraform state is local by design.
- `infrastructure/environments/development`: development Cloud Run deployment and remote state prefix.
- `infrastructure/environments/production`: production Cloud Run deployment and remote state prefix.
- `infrastructure/modules/cloud-run-environment`: shared Cloud Run resources used by both environments.

## Bootstrap

Run this only from a trusted administrator workstation with credentials sufficient to enable services, create IAM resources, and create GCS and Artifact Registry resources:

```sh
terraform -chdir=infrastructure/bootstrap init
terraform -chdir=infrastructure/bootstrap apply
```

After the apply, create these GitHub Actions repository variables from its outputs:

```sh
terraform -chdir=infrastructure/bootstrap output -raw workload_identity_provider
terraform -chdir=infrastructure/bootstrap output -raw deployer_service_account
```

Set their values as `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_DEPLOYER_SERVICE_ACCOUNT`, respectively. They are identifiers, not secrets.

The bootstrap's local `terraform.tfstate` is sensitive operational state. Keep it outside source control and retain a secure backup. Do not destroy the bootstrap stack while an environment exists because it owns the remote-state bucket, registry, identities, and API enablement.

## Environment state

Environment Terraform state is stored in the versioned bucket `brainlesschef-us-east1-terraform-state` under these prefixes:

- `environments/development`
- `environments/production`

Initialize and inspect an environment manually with:

```sh
terraform -chdir=infrastructure/environments/development init
terraform -chdir=infrastructure/environments/development plan
```

If `terraform_state_bucket_name` is changed during bootstrap, change the hard-coded backend bucket in both environment `versions.tf` files and in CI before the first environment initialization. Backend configuration cannot use normal Terraform variables.

## Deployment

The `Deploy` GitHub Actions workflow validates the workspace, builds immutable container tags using the Git commit SHA, pushes them to Artifact Registry, and applies Terraform with those image references.

- A push to `main` deploys development.
- A manual dispatch can target development or production.
- Configure the GitHub `production` Environment with required reviewers before production use. The workflow's environment binding then enforces approval before it receives its OIDC token.

To roll back, manually dispatch the workflow for the target environment from the prior known-good commit. This rebuilds and deploys that commit under its immutable SHA tag.

## Changes to IAM

Add runtime permissions in bootstrap, scoped to the specific runtime service account and target resource. Do not use service-account keys, `roles/owner`, or broad project roles as a shortcut. If a new GitHub repository or workflow needs deployment access, constrain it with a distinct Workload Identity Federation condition and service account.
