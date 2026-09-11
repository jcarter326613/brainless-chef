# Infrastructure Operations

## Layout

- `infrastructure/bootstrap`: project-wide APIs, Artifact Registry, Terraform-state bucket, service accounts, and GitHub OIDC federation. Its state uses the remote `bootstrap` prefix.
- `infrastructure/environments/development`: development Cloud Run deployment, Firestore database, and remote state prefix.
- `infrastructure/environments/production`: production Cloud Run deployment, Firestore database, and remote state prefix.
- `infrastructure/modules/cloud-run-environment`: shared Cloud Run resources used by both environments.

## Bootstrap

Run this only from a trusted administrator workstation with credentials sufficient to enable services, create IAM resources, and create GCS and Artifact Registry resources:

```sh
terraform -chdir=infrastructure/bootstrap init
terraform -chdir=infrastructure/bootstrap apply
```

For a new project, the backend bucket must exist before `terraform init`. Create only that prerequisite with Google Cloud CLI, enable versioning, initialize Terraform, and import the bucket directly into remote state. The exact first-run commands are in `infrastructure/bootstrap/README.md`. Do not use `-backend=false` for an apply or import and do not create local bootstrap state.

After the apply, create these GitHub Actions repository variables from its outputs:

```sh
terraform -chdir=infrastructure/bootstrap output -raw workload_identity_provider
terraform -chdir=infrastructure/bootstrap output -raw deployer_service_account
```

Set their values as `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_DEPLOYER_SERVICE_ACCOUNT`, respectively. They are identifiers, not secrets.

All Terraform state is sensitive operational data and must remain in the versioned GCS backend. Recover damaged state from GCS object history; never use local state as a fallback. Do not destroy the bootstrap stack while an environment exists because it owns the remote-state bucket, registry, identities, and API enablement. Terraform also prevents destruction of the state bucket.

Bootstrap grants the CI deployer a custom DNS role on the existing `brainlesschef-com` zone only. It can read the zone and manage record-set changes, but has no project-wide Cloud DNS permission. The deployer must also be a verified Google Search Console owner of `brainlesschef.com` before Terraform can create a Cloud Run domain mapping.

The environment stacks own Firestore Native Mode databases in `us-east1`: production owns `(default)` and development owns `development`. The location selected for the first Firestore database is permanent. The production and development API, worker, and migration service accounts receive `roles/datastore.user` only for their assigned database through IAM conditions; web identities have no Firestore data access. CI can deploy worker and migration jobs as their dedicated identities, but CI itself can read database metadata only and cannot read or write documents or create, update, or delete databases.

After introducing or changing runtime identities, reapply `infrastructure/bootstrap` from the trusted administrator workstation before running the updated deployment workflow.

## Remote state

Terraform state is stored in the versioned bucket `brainlesschef-us-east1-terraform-state` under these prefixes:

- `bootstrap`
- `environments/development`
- `environments/production`

Initialize and inspect an environment manually with:

```sh
terraform -chdir=infrastructure/environments/development init
terraform -chdir=infrastructure/environments/development plan
```

If `terraform_state_bucket_name` is changed, change the hard-coded backend bucket in the bootstrap, development, and production `versions.tf` files before initialization. Backend configuration cannot use normal Terraform variables.

## Cost controls

Cloud Run services use request-based CPU allocation and `min_instance_count = 0`; no service instance is kept warm, and CPU and memory are billed only during startup, shutdown, and request handling. Each service caps at two instances. The inference worker allocates 8 vCPU and 16 GiB only during a Job execution, with one task, no retries, and a 15-minute timeout. This does not prevent charges from requests, executions, egress, or retained storage.

The state bucket deletes archived state versions after 30 days. Container images are separated by environment: development images expire after 3 days, while the 3 most recent production API, web, and worker versions are retained for rollback. Artifact Registry cleanup is asynchronous, so transient versions can remain briefly after they meet a deletion policy.

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

The `Deploy` GitHub Actions workflow uses the Git commit SHA as its release identifier. Development reuses an existing SHA-tagged component or builds it once; production promotes the tested development images with the selected SHA, without rebuilding them, then applies Terraform with the promoted image references. The worker build verifies and bundles its pinned GGUF model and model license.

- A push to `main` deploys development.
- A manual development dispatch builds the selected commit and deploys it to development.
- A manual production dispatch requires `image_tag`: the full SHA of a development image already deployed and tested. It copies that exact artifact to the production path, unless that production release is already retained for rollback.
- Configure the GitHub `production` Environment with required reviewers before production use. The workflow's environment binding then enforces approval before it receives its OIDC token.

Before Terraform updates the services, the workflow first applies the environment's Firestore database resource only. This targeted foundation step permits a first deployment to create the database without deploying an API revision that would reject its uninitialized migration ledger. For an initial environment, manually dispatch `Deploy` with `run_migrations` enabled; it initializes the ledger before services deploy. Do not use this pre-deployment option for a schema-changing release while an older API revision can still serve traffic.

Compatible releases deploy without changing existing documents. Manually dispatch `Migrate Database` when an explicit storage migration must run, using the deployed API image's full Git SHA. It runs the single-task `brainless-chef-<environment>-migrate` Cloud Run Job under the environment migration identity. The CI identity cannot perform the migration directly. A failed migration leaves the already-deployed compatible services running; unrelated production writes continue while each migrated document is protected by its transaction.

The migration ledger and lease live in the `__firestore_migrations` collection. Re-run the same release job after correcting an external failure. If migration logic must change after it has started, add a new migration rather than editing the existing one. Never edit a completed migration or manually clear a live lease. See the [`firestore-database` documentation](https://github.com/jcarter326613/firestore-database) for the full migration and query contract.

Firestore migrations are forward-only. Use compatible releases for strict schemas:

1. Retain old fields and make newly introduced fields optional while application versions overlap.
2. Deploy the compatible application. Reads ignore fields outside the running schema.
3. Run `Migrate Database` to populate required values, split documents, or update indexed fields.
4. Make new fields required only after the migration completes and unsafe older application versions are gone.

Fields used in Firestore filters, ordering, indexes, or cursors must remain compatible during the overlap. Do not issue queries against a new or renamed field until an explicit storage migration has populated it. Runtime query code validates known fields but never modifies documents.

To roll back production, manually dispatch the workflow with the SHA of one of the three retained production releases. The workflow reuses that production artifact; if it has not yet been promoted, it copies the matching development artifact instead. A rollback is permitted only when that image contains the migration command and has the same explicit migration registry. Recover from an incompatible migration with a new forward release or a deliberate database restore, not by bypassing the ledger.

## Changes to IAM

Add runtime permissions in bootstrap, scoped to the specific runtime service account and target resource. Do not use service-account keys, `roles/owner`, or broad project roles as a shortcut. If a new GitHub repository or workflow needs deployment access, constrain it with a distinct Workload Identity Federation condition and service account.

Firestore server access uses IAM rather than Firebase Security Rules. Do not grant an API identity `roles/datastore.user` without a database-specific IAM condition, and do not share an API identity between environments.

The API service has no `allUsers` invoker binding. Callers need `run.routes.invoke`, normally through `roles/run.invoker`, and must send a Google-signed identity token. Worker Jobs are not public; each API identity can run only its environment's Job with execution overrides.

Set the GitHub Environment variable `API_INVOKER_MEMBERS` to a JSON list of IAM members so CI preserves resource-level access, for example `["user:developer@example.com"]` in development or a controlled operator group in production. Terraform receives this as `api_invoker_members`; an empty list intentionally grants no additional caller beyond existing project-level IAM.
