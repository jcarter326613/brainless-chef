# Architecture

## Scope

Brainless Chef is a small-volume web product with a Cloud Run web service, a database-migration container image, and a local Qwen prompt experiment:

- `apps/web` is a React single-page application built with Vite, served from a Cloud Run container that also reverse-proxies `/api` to the API service.
- `apps/api` is the HTTP API gateway served from its own Cloud Run container; the same container image also runs the database-migration Cloud Run Job.
- `apps/worker` is a local Qwen prompt experiment with no Cloud Run or deployment integration.

Each deployed workload is stateless. Application data is stored in Firestore Native Mode; object storage and a dedicated queue service are intentionally absent until a product requirement justifies them.

Database-using application and migration code access application collections through `packages/database`. That package defines Zod document schemas and optional storage migrations, then configures the connection-owning [`firestore-database`](https://github.com/jcarter326613/firestore-database) facade. The facade validates known fields on every read, query result, and write, and does not expose raw Firestore clients or transactions to application code.

## Request flow

```text
Browser
  -> Cloud Run web service (SPA + /api proxy)
  -> Cloud Run API service
  -> Firestore
```

The release API image, built from `apps/api`, runs as the API Cloud Run service and, with `node dist/migrate.js`, as a dedicated Cloud Run Job for database migrations. The job compares the explicit storage-migration registry to a Firestore ledger, acquires a fenced lease, and applies pending migrations one document at a time. Document transactions allow unrelated production work to continue while protecting each migrated source document from conflicting writes.

For the web and API services, Cloud Run owns TLS termination, request routing, health management, and horizontal scaling. Each container listens on `PORT` (Cloud Run supplies it, normally `8080`) and must not depend on local filesystem persistence or in-memory session state. The web container serves the built SPA and forwards `/api/*` to the API service; the API container owns the magic-link, session-cookie, and Firestore access granted to that environment.

## Environment boundaries

Development and production have separate Cloud Run web services, Firestore databases, and Terraform state prefixes. Both currently live in Google Cloud project `brainlesschef`, region `us-east1`; separate projects can be introduced later if stronger organizational isolation becomes necessary.

Only production maps `brainlesschef.com` to the production web service. Development remains available only through its generated `run.app` URL. Cloud Run domain mapping terminates TLS directly at Cloud Run, without a load balancer, and Cloud DNS publishes the generated apex records.

The web service allows unauthenticated invocation, as does the API service. The API's magic-link and session-token authentication is the boundary that guards every database read or write.

## Identity boundaries

- A human administrator applies `infrastructure/bootstrap` one time with elevated project access.
- GitHub Actions exchanges its GitHub-issued OIDC token for the `brainless-chef-deployer` service account. No JSON key is created or stored.
- The federated identity is restricted to `jcarter326613/brainless-chef`.
- CI receives only image-publishing, Cloud Run administration, Terraform-state access, service-usage, and permission to attach the pre-created runtime identities.
- Web services use dedicated environment runtime service accounts with no Firestore access and no application secrets; they serve the SPA and proxy `/api` only.
- API services use dedicated environment runtime service accounts with `roles/datastore.user` scoped to their one database; they are the only runtime path to application data.
- Migration jobs use dedicated environment service accounts with the same one-database IAM boundary. GitHub Actions can create and execute a job as those identities but cannot access Firestore documents itself.
- Firestore Security Rules do not govern server-side Firebase Admin SDK access. The IAM condition is the enforced boundary for API and migration identities.
- Each environment Terraform state owns its database and future database-specific recovery settings. Bootstrap owns the shared runtime identities and IAM policy.

## Cost posture

The Cloud Run web and API services set `min_instance_count` to zero, cap at two instances, use 512 MiB of memory and one vCPU, and explicitly allocate CPU only while serving requests. The trade-off is occasional cold starts.

Artifact Registry and the versioned Terraform state bucket are regional in `us-east1`. State remains private through uniform bucket-level access and enforced public-access prevention. These storage resources are not zero-cost: archived state is retained for 30 days, development images expire after 3 days, and the 3 most recent production migration and web versions are retained for rollback.

Firestore has no idle compute cost. Production uses the default database and receives the project's one Firestore free quota; the named development database is billed for its actual operations and stored data.
