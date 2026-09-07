# Infrastructure Operations

## Layout

- `infrastructure/bootstrap`: project-wide APIs, Artifact Registry, Terraform-state bucket, service accounts, and GitHub OIDC federation. Its Terraform state is local by design.
- `infrastructure/environments/development`: development Cloud Run deployment, Firestore database, and remote state prefix.
- `infrastructure/environments/production`: production Cloud Run deployment, Firestore database, and remote state prefix.
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

Bootstrap grants the CI deployer a custom DNS role on the existing `brainlesschef-com` zone only. It can read the zone and manage record-set changes, but has no project-wide Cloud DNS permission. The deployer must also be a verified Google Search Console owner of `brainlesschef.com` before Terraform can create a Cloud Run domain mapping.

The environment stacks own Firestore Native Mode databases in `us-east1`: production owns `(default)` and development owns `development`. The location selected for the first Firestore database is permanent. The production and development API and migration service accounts receive `roles/datastore.user` only for their assigned database through IAM conditions; web identities have no Firestore data access. CI can create and execute Cloud Run migration jobs as the migration identities, but CI itself can read database metadata only and cannot read or write documents or create, update, or delete databases.

After introducing the migration identities, reapply `infrastructure/bootstrap` from the trusted administrator workstation before running the updated deployment workflow.

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

## Cost controls

Cloud Run uses request-based CPU allocation and `min_instance_count = 0`; no service instance is kept warm, and CPU and memory are billed only during startup, shutdown, and request handling. Each service caps at two instances. This does not prevent charges from requests, egress, or retained storage.

The state bucket deletes archived state versions after 30 days. Container images are separated by environment: development images expire after 3 days, while the 3 most recent production API and web versions are retained for rollback. Artifact Registry cleanup is asynchronous, so transient versions can remain briefly after they meet a deletion policy.

## Production domain

The production environment alone maps `brainlesschef.com` to `brainless-chef-production-web`. It uses Cloud Run domain mapping and the existing `brainlesschef-com` Cloud DNS zone, with no load balancer or reserved IP. The deployer must be a verified Search Console owner before the first production apply. Cloud Run returns the required apex `A` and `AAAA` records; Terraform writes those records with a five-minute TTL and Cloud Run provisions the managed TLS certificate.

Certificate issuance usually completes in minutes but can take up to 24 hours. Check progress after deployment with:

```sh
terraform -chdir=infrastructure/environments/production output website_domain_mapping_status
dig +short A brainlesschef.com
curl -I https://brainlesschef.com
```

`www.brainlesschef.com` is intentionally not mapped. Cloud Run domain mapping is Preview, not GA; reassess this approach before the service has stronger reliability or edge-security requirements.

## Deployment

The `Deploy` GitHub Actions workflow uses the Git commit SHA as an immutable release identifier. Development builds and deploys the image once; production promotes the tested development image with the selected SHA, without rebuilding it, then applies Terraform with the promoted image reference.

- A push to `main` deploys development.
- A manual development dispatch builds the selected commit and deploys it to development.
- A manual production dispatch requires `image_tag`: the full SHA of a development image already deployed and tested. It copies that exact artifact to the production path, unless that production release is already retained for rollback.
- Configure the GitHub `production` Environment with required reviewers before production use. The workflow's environment binding then enforces approval before it receives its OIDC token.

Before Terraform updates the services, the workflow first applies the environment's Firestore database resource only. This targeted foundation step permits a first deployment to create the database without deploying an API revision that would reject its uninitialized migration ledger. The workflow then deploys a single-task `brainless-chef-<environment>-migrate` Cloud Run Job using the release API image and the environment's migration identity, then waits for it to succeed. The CI identity cannot perform the migration directly. A failed migration stops the deployment and leaves the existing services running.

The migration ledger and lease live in the `__firestore_migrations` collection. Re-run the same release job after correcting an external failure; completed pages resume from their recorded document-ID cursor. If unapplied migration code must change after a partial failure, update its checksum and ensure it is idempotent, because its checkpoints restart from the beginning. Never edit a completed migration or manually clear a live lease. See `packages/firestore-database/README.md` for the full migration and query contract.

Firestore migrations are forward-only. Use staged expand/contract releases for strict schemas:

1. Deploy readers whose strict schema permits both the old shape and an optional new field, without backfilling yet.
2. In a later release, backfill the new field and deploy writers that always provide it; the previous release can still read both shapes.
3. Remove the old field only in another release after compatibility with old readers, writers, and rollback images is intentionally no longer required.

Fields used in Firestore filters, ordering, indexes, or cursors must be fully backfilled before a release issues queries against the new field. Runtime query code validates returned documents but never performs document-by-document migration.

To roll back production, manually dispatch the workflow with the SHA of one of the three retained production releases. The workflow reuses that production artifact; if it has not yet been promoted, it copies the matching development artifact instead. A rollback is permitted only when that image contains the migration command and has the same migration registry as the current database. The migration verification intentionally blocks older images across a migration boundary. Recover from an incompatible migration with a new forward release or a deliberate database restore, not by bypassing the ledger.

## Changes to IAM

Add runtime permissions in bootstrap, scoped to the specific runtime service account and target resource. Do not use service-account keys, `roles/owner`, or broad project roles as a shortcut. If a new GitHub repository or workflow needs deployment access, constrain it with a distinct Workload Identity Federation condition and service account.

Firestore server access uses IAM rather than Firebase Security Rules. Do not grant an API identity `roles/datastore.user` without a database-specific IAM condition, and do not share an API identity between environments.
