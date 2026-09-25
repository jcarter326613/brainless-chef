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

After the apply, read the environment-specific deployer and federation values:

```sh
terraform -chdir=infrastructure/bootstrap output workload_identity_providers
terraform -chdir=infrastructure/bootstrap output deployer_service_accounts
```

Set the development values as `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_DEPLOYER_SERVICE_ACCOUNT` in the GitHub `development` Environment. Set the production values under the same names in the protected GitHub `production` Environment. They are identifiers, not secrets. Development federation accepts branch refs with the development Environment; production federation accepts only `main` with the production Environment.

Use `workflow_dispatch` from a feature branch to deploy development intentionally. Production dispatches are rejected unless the workflow runs from `main`, and the selected image SHA must be reachable from `main`.

All Terraform state is sensitive operational data and must remain in the versioned GCS backend. Recover damaged state from GCS object history; never use local state as a fallback. Do not destroy the bootstrap stack while an environment exists because it owns the remote-state bucket, registry, identities, and Google Cloud service enablement. Terraform also prevents destruction of the state bucket.

Bootstrap alone manages IAM bindings. The deploy workflow has no IAM policy write permission. Only the production deployer receives a custom DNS role on the existing `brainlesschef-com` zone; development uses its generated Cloud Run URL and cannot change production DNS records. The production deployer must also be a verified Google Search Console owner of `brainlesschef.com` before Terraform can create a Cloud Run domain mapping.

The environment stacks own Firestore Native Mode databases in `us-east1`: production owns `(default)` and development owns `development`. The location selected for the first Firestore database is permanent. The production and development API service accounts and migration service accounts receive `roles/datastore.user` only for their assigned database through IAM conditions; web identities have no Firestore data access. CI can enqueue migration tasks as their dedicated identities, but CI itself can read database metadata only and cannot read or write documents or create, update, or delete databases.

After introducing or changing runtime identities, reapply `infrastructure/bootstrap` from the trusted administrator workstation before running the updated deployment workflow.

## Remote state

Terraform state is stored in versioned buckets:

- `brainlesschef-us-east1-terraform-state/bootstrap`
- `brainlesschef-us-east1-development-terraform-state/environment`
- `brainlesschef-us-east1-development-terraform-state/migrate`
- `brainlesschef-us-east1-production-terraform-state/environment`
- `brainlesschef-us-east1-production-terraform-state/migrate`

Initialize and inspect an environment manually with:

```sh
terraform -chdir=infrastructure/environments/development init
terraform -chdir=infrastructure/environments/development plan
```

For an established project, pause deployments and run this one administrator command from the repository root before changing GitHub Environment variables:

```sh
bash infrastructure/bootstrap/migrate-environment-state.sh
```

It creates the isolated state buckets and deployer identities, migrates all four environment backends, transfers the existing migration queue and IAM ownership into bootstrap, removes retired resource addresses without deleting their live resources, applies bootstrap, and verifies each environment plan. It leaves the old versioned state objects intact for rollback.

## Cost controls

Cloud Run services use request-based CPU allocation and `min_instance_count = 0`; no service instance is kept warm, and CPU and memory are billed only during startup, shutdown, and request handling. Each service caps at two instances. This does not prevent charges from requests, egress, or retained storage.

All state buckets delete archived state versions after 30 days. Container images are stored in separate development and production repositories so development credentials cannot write production image paths.

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

The `Deploy` GitHub Actions workflow uses the Git commit SHA as the API, migration, and web release identifier. Development checks Artifact Registry before building any component. Production promotes component manifests directly inside Artifact Registry without rebuilding them.

- A push to `main` deploys development.
- A manual development dispatch builds the selected commit and deploys it to development.
- A manual production dispatch requires `image_tag`: the full SHA of a development migration and web release already deployed and tested. It promotes those images unless each production artifact is already retained for rollback.
- Configure the GitHub `production` Environment with required reviewers before production use. The workflow's environment binding then enforces approval before it receives its OIDC token.

Before Terraform updates the web service, the workflow first applies a targeted foundation: the environment's Firestore database and its Secret Manager containers. For an initial environment, this step creates the database before its migration ledger is initialized, and creates the secret containers the API depends on; the workflow then seeds those containers' first versions from GitHub secrets before the full stacks apply. Do not deploy a schema-changing release while an older deployed application version still relies on the previous stored shape.

Compatible releases deploy without changing existing documents. On every deploy the workflow applies the environment's dedicated migrate stack (`infrastructure/environments/<environment>/migrate`), deploying the `brainless-chef-<environment>-migrate` Cloud Run service with the release migration image before the web/API stack applies. This ordering ensures the migrator always runs the same migration registry as the release being validated. The workflow then enqueues a Cloud Tasks HTTP task on the `brainless-chef-<environment>-migrate` queue (`migrate-<environment>-<sha>`) targeting the migrator's `/__migrate` endpoint under the environment migration identity, and polls `/__migrate/status/<task>` until the run succeeds or fails. Re-running the same release short-circuits on the already-succeeded task, so migrations run automatically on every deploy and are safe to repeat. The queue allows one concurrent dispatch and no retries, so a migration either completes once or fails loudly. The CI identity cannot perform the migration itself. A failed migration leaves the already-deployed compatible web and API services running; unrelated production writes continue while each migrated document is protected by its transaction.

The migration ledger and lease live in the `__firestore_migrations` collection; migration task status lives in the `migration-tasks` collection keyed by the stable task name, which makes workflow re-runs idempotent. Re-run the same release migration after correcting an external failure. If migration logic must change after it has started, add a new migration rather than editing the existing one. Never edit a completed migration or manually clear a live lease. See the [`firestore-database` documentation](https://github.com/jcarter326613/firestore-database) for the full migration and query contract.

Firestore migrations are forward-only. Use compatible releases for strict schemas:

1. Retain old fields and make newly introduced fields optional while application versions overlap.
2. Deploy the compatible application. Reads ignore fields outside the running schema.
3. Deploy the compatible application; its migration runs automatically as part of the deploy. A subsequent deploy of the same release short-circuits the already-completed migration.
4. Make new fields required only after the migration completes and unsafe older application versions are gone.

Fields used in Firestore filters, ordering, indexes, or cursors must remain compatible during the overlap. Do not issue queries against a new or renamed field until an explicit storage migration has populated it. Runtime query code validates known fields but never modifies documents.

To roll back production, manually dispatch the workflow with the SHA of one of the three retained production releases. The workflow reuses that production artifact; if it has not yet been promoted, it copies the matching development artifact instead. A rollback is permitted only when its migration image has the same explicit migration registry. Recover from an incompatible migration with a new forward release or a deliberate database restore, not by bypassing the ledger.

## Secrets and configuration

Runtime secrets and non-secret configuration are not baked into container images or passed as plain `-var` values from the workflow, so their values never enter Terraform state.

**Secret Manager holds the two secrets.** Each environment owns a `google_secret_manager_secret` container per secret: `jwt-secret-<environment>` and `mailtrap-api-token-<environment>`. The environment Terraform stack creates the containers and grants the API runtime access, but never creates versions and never stores values. The `Deploy` workflow's foundation step creates the containers, and its seed step adds a version from the `JWT_SECRET` and `MAILTRAP_API_TOKEN` GitHub environment secrets only when the container has no enabled version — so re-deploys are idempotent. Cloud Run injects the values into the API container through `env.value_source` (`secret_key_ref`); the API never reads them itself.

Rotate a secret by adding a new enabled version and destroying the old one; the container's latest version serves the next API redeployment:

```sh
printf '%s' "$NEW_VALUE" | gcloud secrets versions add jwt-secret-production \
  --project brainlesschef --data-file=-
gcloud secrets versions destroy jwt-secret-production \
  --project brainlesschef -v <old-version>
```

GitHub secret values must be updated to the same new value first so a subsequent container-first deploy does not re-seed it. Development can read its secrets from repository variables; production requires the environment-protected secrets.

**Parameter Manager holds non-secret per-environment configuration.** Parameters `<environment>-api-mail-from`, `<environment>-api-mailtrap-mode`, `<environment>-api-public-url`, and `<environment>-api-mailtrap-test-inbox-id` store values that are plain Terraform inputs, so normal `terraform apply` updates them. The sandbox inbox ID is required only when `mailtrap_mode` is `sandbox`; configure it as the `MAILTRAP_TEST_INBOX_ID` GitHub environment variable. Version IDs are content-derived (`v-<sha256>`), so changing a value creates a new version and retires the old one; the API resolves `latest` at startup. The API runtime service account has `roles/parametermanager.viewer` project-wide because this provider generation predates per-parameter IAM resources; the project stores only these configuration parameters. At startup the API fetches the latest versions under Application Default Credentials and merges them over its base environment, so parameter changes take effect on the next API deployment and no commit-specific value is hard-coded. `APP_ENVIRONMENT` is an identifier (not a secret) set on the API container so the API can resolve its parameters; other identifiers such as the Firestore database name remain environment variables.

## Changes to IAM

Add runtime permissions in bootstrap, scoped to the specific runtime service account and target resource. Do not use service-account keys, `roles/owner`, or broad project roles as a shortcut. If a new GitHub repository or workflow needs deployment access, constrain it with a distinct Workload Identity Federation condition and service account.

Firestore server access uses IAM rather than Firebase Security Rules. Do not grant a migration identity `roles/datastore.user` without a database-specific IAM condition, and do not share a migration identity between environments.
