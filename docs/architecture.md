# Architecture

## Scope

Brainless Chef is a small-volume web product composed of two independently deployable TypeScript applications:

- `apps/web` is a React single-page application built with Vite and served from a Cloud Run container.
- `apps/api` is an Express HTTP API deployed as a separate Cloud Run service.

Each service is stateless. Recipe data is stored in Firestore Native Mode; object storage and queues are intentionally absent until a product requirement justifies them.

Backend processes access application collections through `packages/database`. That package defines Zod document schemas and optional storage migrations, then configures the connection-owning [`firestore-database`](https://github.com/jcarter326613/firestore-database) facade. The facade validates known fields on every read, query result, and write, and does not expose raw Firestore clients or transactions to application code.

## Request flow

```text
Browser
  -> Cloud Run web service
  -> Cloud Run API service (when the web client calls it)
  -> Firestore database for the API environment
```

The release API image can run as a dedicated Cloud Run migration job. The job compares the explicit storage-migration registry to a Firestore ledger, acquires a fenced lease, and applies pending migrations one document at a time. Document transactions allow unrelated production work to continue while protecting each migrated source document from conflicting writes.

Cloud Run owns TLS termination, request routing, health management, and horizontal scaling. Containers listen on `PORT` (Cloud Run supplies it, normally `8080`) and must not depend on local filesystem persistence or in-memory session state.

## Environment boundaries

Development and production have separate Cloud Run services, Firestore databases, and Terraform state prefixes. Both currently live in Google Cloud project `brainlesschef`, region `us-east1`; separate projects can be introduced later if stronger organizational isolation becomes necessary.

Only production maps `brainlesschef.com` to the production web service. Development remains available only through its generated `run.app` URL. Cloud Run domain mapping terminates TLS directly at Cloud Run, without a load balancer, and Cloud DNS publishes the generated apex records.

Initial services allow unauthenticated invocation so the website and API can be reached directly. This is only appropriate while the API exposes no sensitive or data-changing functionality. Authentication and authorization must be designed before adding such endpoints.

## Identity boundaries

- A human administrator applies `infrastructure/bootstrap` one time with elevated project access.
- GitHub Actions exchanges its GitHub-issued OIDC token for the `brainless-chef-deployer` service account. No JSON key is created or stored.
- The federated identity is restricted to `jcarter326613/brainless-chef`.
- CI receives only image-publishing, Cloud Run administration, Terraform-state access, service-usage, and permission to attach the pre-created runtime identities.
- Web services use dedicated environment runtime service accounts with no Firestore access.
- API services use separate environment runtime service accounts. Each has `roles/datastore.user` with an IAM condition permitting access to exactly one Firestore database: production uses `(default)` and development uses `development`.
- Migration jobs use dedicated environment service accounts with the same one-database IAM boundary. GitHub Actions can create and execute a job as those identities but cannot access Firestore documents itself.
- Firestore Security Rules do not govern server-side Firebase Admin SDK access. The IAM condition is the enforced boundary for API identities.
- Each environment Terraform state owns its database and future database-specific recovery settings. Bootstrap owns only the shared API identities and IAM policy.

## Cost posture

Cloud Run services set `min_instance_count` to zero, cap at two instances, use 512 MiB of memory and one vCPU, and explicitly allocate CPU only while serving requests. Therefore, non-minimum instances are not billed while idle and the services can scale to zero. The trade-off is occasional cold starts.

Artifact Registry and the versioned Terraform state bucket are regional in `us-east1`. State remains private through uniform bucket-level access and enforced public-access prevention. These storage resources are not zero-cost: archived state is retained for 30 days, development images expire after 3 days, and the 3 most recent production versions of each application are retained for rollback.

Firestore has no idle compute cost. Production uses the default database and receives the project's one Firestore free quota; the named development database is billed for its actual operations and stored data.
