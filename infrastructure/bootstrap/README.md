# Bootstrap

This directory creates project-wide resources and deliberately uses local Terraform state. It must be applied by a trusted administrator once, before environment deployments.

```sh
terraform init
terraform apply
```

Record the `deployer_service_account` and `workload_identity_provider` outputs as GitHub Actions repository variables named `GCP_DEPLOYER_SERVICE_ACCOUNT` and `GCP_WORKLOAD_IDENTITY_PROVIDER`.

The generated state bucket is `brainlesschef-us-east1-terraform-state` by default. If its name is changed, update both environment backend blocks and the `TF_STATE_BUCKET` value in `.github/workflows/deploy.yml` before initializing an environment.
