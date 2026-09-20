# Architecture

## Scope

Brainless Chef is a small-volume web product with a Cloud Run web service, a Cloud Run API gateway, a Cloud Tasks-triggered migration service, and a local Qwen prompt experiment:

- `apps/web` is a React single-page application built with Vite, served from a Cloud Run container that also reverse-proxies `/api` to the API service.
- `apps/api` is the HTTP API gateway served from its own Cloud Run container.
- `apps/migrate` is a Cloud Run service that runs database migrations; it is invoked by a per-environment Cloud Tasks queue rather than a Cloud Run Job.
- `apps/worker` is a local Qwen prompt experiment with no Cloud Run or deployment integration.

Each deployed workload is stateless. Application data is stored in Firestore Native Mode; object storage is intentionally absent until a product requirement justifies it. A Cloud Tasks queue is used only to dispatch migrations: per-task billing avoids the one-minute Cloud Run Job minimum, and the queue serializes dispatches so an environment never runs two migrations concurrently.

Database-using application and migration code access application collections through `packages/database`. That package defines Zod document schemas and optional storage migrations, then configures the connection-owning [`firestore-database`](https://github.com/jcarter326613/firestore-database) facade. The facade validates known fields on every read, query result, and write, and does not expose raw Firestore clients or transactions to application code.

## Request flow

```text
Browser
  -> Cloud Run web service (SPA + /api proxy)
  -> Cloud Run API service
  -> Firestore
```

The release API image, built from `apps/api`, runs as the API Cloud Run service. The release migration image, built from `apps/migrate`, runs as the `brainless-chef-<environment>-migrate` Cloud Run service. A Cloud Tasks HTTP task targets the migrator's `/__migrate` endpoint; the handler compares the explicit storage-migration registry to a Firestore ledger, acquires a fenced lease, and applies pending migrations one document at a time. Document transactions allow unrelated production work to continue while protecting each migrated source document from conflicting writes.

For the web and API services, Cloud Run owns TLS termination, request routing, health management, and horizontal scaling. Each container listens on `PORT` (Cloud Run supplies it, normally `8080`) and must not depend on local filesystem persistence or in-memory session state. The web container serves the built SPA and forwards `/api/*` to the API service; the API container owns the magic-link, session-cookie, and Firestore access granted to that environment.

## Environment boundaries

Development and production have separate Cloud Run web services, Firestore databases, Terraform state buckets, Artifact Registry repositories, and GitHub deployer identities. Both currently live in Google Cloud project `brainlesschef`, region `us-east1`; project-scoped deployment permissions mean separate projects are still required for complete authorization isolation.

Only production maps `brainlesschef.com` to the production web service. Development remains available only through its generated `run.app` URL. Cloud Run domain mapping terminates TLS directly at Cloud Run, without a load balancer, and Cloud DNS publishes the generated apex records.

The web service allows unauthenticated invocation, as does the API service. The API's magic-link and session-token authentication is the boundary that guards every database read or write.

## Identity boundaries

- A human administrator applies `infrastructure/bootstrap` one time with elevated project access.
- GitHub Actions exchanges its GitHub-issued OIDC token for an environment-specific deployer service account. No JSON key is created or stored.
- The development federation accepts repository branch refs only when the job uses the `development` GitHub Environment. The production federation accepts only `refs/heads/main` with the protected `production` Environment.
- CI receives only image-publishing, Cloud Run development, Terraform-state access, service-usage, and permission to attach the pre-created runtime identities. Bootstrap alone writes IAM policies.
- Web services use dedicated environment runtime service accounts with no Firestore access and no application secrets; they serve the SPA and proxy `/api` only.
- Component images use dedicated environment runtime service accounts. API services use `roles/datastore.user` scoped to their one database and are the only runtime path to application data.
- Migration services use dedicated environment service accounts with the same one-database IAM boundary. GitHub Actions can enqueue a migration task as those identities but cannot access Firestore documents itself.
- Firestore Security Rules do not govern server-side Firebase Admin SDK access. The IAM condition is the enforced boundary for API and migration identities.
- Each environment Terraform state owns its database and future database-specific recovery settings. Bootstrap owns runtime identities, IAM policy, and migration queues. A per-environment migrate Terraform stack owns only the migrator Cloud Run service and applies before the web/API stack so migration code deploys ahead of application code.

## Cost posture

The Cloud Run web, API, and migrator services set `min_instance_count` to zero, keep instance counts low, and explicitly allocate CPU only while serving requests. The migrator service scales to zero between migrations, so a migration that completes in seconds bills at sub-minute precision instead of a Cloud Run Job's one-minute minimum; the per-task Cloud Tasks charge is negligible.

Artifact Registry and the versioned Terraform state buckets are regional in `us-east1`. State remains private through uniform bucket-level access and enforced public-access prevention. Archived state is retained for 30 days.

Firestore has no idle compute cost. Production uses the default database and receives the project's one Firestore free quota; the named development database is billed for its actual operations and stored data.
