# Architecture Decisions

## ADR-001: pnpm workspace

**Decision:** Use one pnpm workspace for the web application and database-migration image source.

**Rationale:** It provides a single lockfile and consistent Node and TypeScript tooling without forcing the web application and migration image into one deployable artifact.

## ADR-002: Cloud Run for compute

**Status:** Superseded by ADR-012 for the migration execution mechanism; Cloud Run remains the compute platform.

**Decision:** Deploy the web application as a Cloud Run service in `us-east1` and run database migrations as a Cloud Run Job.

**Rationale:** Cloud Run permits scale-to-zero stateless services and jobs without server maintenance. The web service and migration image can change independently, while migrations run only when explicitly requested rather than as part of request handling or service startup.

## ADR-003: GCS remote Terraform state

**Decision:** Store every Terraform stack's state in a versioned, non-public regional GCS bucket. Local Terraform state is prohibited, including for the bootstrap stack.

**Rationale:** Remote state supports shared deployment, locking, and recovery from an accidental state change. Versioning is low-cost protection against state corruption. Because Terraform cannot create the bucket that contains its state before backend initialization, a trusted administrator creates that one prerequisite with Google Cloud CLI and imports it into the bootstrap's remote state.

## ADR-004: GitHub OIDC federation

**Decision:** Authenticate GitHub Actions with Workload Identity Federation restricted to `jcarter326613/brainless-chef`.

**Rationale:** Short-lived federated credentials remove secret rotation and the risk of a long-lived service-account JSON key. A repository attribute condition prevents identities from other GitHub repositories using the provider.

## ADR-005: Public initial services

**Status:** Superseded.

**Superseded by:** Removal of the deployed HTTP API. The web service remains publicly invokable; there is no API Cloud Run service or invoker policy.

## ADR-006: Production custom domain through Cloud Run mapping

**Decision:** Map `brainlesschef.com` directly to the production web service and `dev.brainlesschef.com` to the development web service through Cloud Run domain mapping, and publish their records in the existing Cloud DNS zone.

**Rationale:** This preserves scale-to-zero Cloud Run pricing and avoids a load balancer or reserved IP. Cloud Run manages the TLS certificate. Domain mapping is a Preview feature with documented limitations, so revisit this decision if production reliability or advanced edge controls require a GA load-balancer-based approach.

## ADR-007: Firestore databases isolated by migration IAM

**Decision:** Store recipe data in Firestore Native Mode. Production uses the `(default)` database and development uses a named `development` database. Each environment Terraform state owns its database and future recovery configuration. Each Cloud Run migration service has a separate runtime service account with `roles/datastore.user` conditioned to its one database; web services have no Firestore data access.

**Rationale:** Firebase Admin SDK requests are authorized with IAM and bypass Firebase Security Rules, while Firestore IAM cannot restrict access to collection paths inside one database. Separate databases are therefore required for an enforced environment boundary. Environment-owned state keeps backup, retention, and recovery choices independent. The production default database retains the single Firestore free quota, and neither database has idle compute cost.

## ADR-008: Validated repositories and forward-only Firestore migrations

**Decision:** Define application Zod schemas and optional storage migrations in `packages/database`, then configure the connection-owning [`firestore-database`](https://github.com/jcarter326613/firestore-database) facade. The facade strips fields outside the running schema on reads. Application releases retain old fields and make new fields optional while versions overlap; release engineers own that compatibility contract. Hidden per-document migration versions reference ordered migration IDs in the Firestore ledger. Run storage migrations in a dedicated migration service invoked by Cloud Tasks (ADR-012); each source-document transaction can read related documents, generate Firestore IDs, write related documents, and advance that source document's migration version.

**Rationale:** Firestore has no DDL schema, migration table, or collection-wide lock. A durable ledger records ordered storage changes and a fenced lease prevents concurrent runners. Per-document transactions make large changes restartable while allowing unrelated production work to continue. The application owns release compatibility by retaining old fields and keeping new fields optional during an overlap. Dedicated services keep migration execution separate from the web service. Release engineers remain responsible for preserving old query fields until an explicit storage migration completes.

## ADR-009: Private API and CPU inference Job (superseded)

**Status:** Superseded.

**Superseded by:** Removal of the deployed HTTP API, worker, and inference-job flow. `apps/worker` remains a local Qwen prompt experiment with no deployment integration.

## ADR-010: Colocated web API and Mailtrap magic-link login

**Status:** Superseded.

**Superseded by:** ADR-011 moves the HTTP API into `apps/api` as its own Cloud Run service. The web service serves only the SPA and reverse-proxies `/api`; the API runtime is the sole path to Firestore.

**Decision:** Re-introduce the HTTP API as `apps/web/api`, served under `/api` by the same Express process that serves the built SPA, on the same origin as the site. Send transactional email through the Mailtrap Node SDK (HTTPS API) wrapped in one `MailService` utility called from request handlers. Authenticate users with single-use email magic links: a 15-minute login JWT backed by a `loginTokens` document, exchanged for a 60-day `HttpOnly` session cookie signed with the same HMAC secret. User and login-token documents live in the environment's existing Firestore database. Development uses the Mailtrap sandbox (mail captured, never delivered); production uses the verified `brainlesschef.com` sending domain. Domain verification, DKIM, SPF, and DMARC records are published in Cloud DNS.

**Rationale:** The site already runs one Cloud Run service, so mounting `/api` on it adds an API without a second service, load balancer, or CORS layer, and keeps `HttpOnly` cookies on the same origin. Mailtrap's SDK is a plain HTTPS call, which sidesteps the Google Cloud edge block on outbound destination port 25 entirely (the provider owns the SMTP delivery hop, IP reputation, retries, and DKIM signing). Email is a roughly 100 ms request-scoped side effect, so no queue, worker, or Cloud Run Job is warranted; a failed send returns 503 and the user can request another link. Workspace was rejected as a per-user recurring cost for login-only mail. Magic links avoid storing passwords and match the existing reference implementation.

**Consequences:** The web runtime now holds `roles/datastore.user` scoped to its own Firestore database. Firestore IAM cannot scope collections, so the runtime can technically reach recipe documents; no endpoint reads them today, and any future data-reading endpoint must enforce per-user authorization before shipping. Session tokens are stateless, so there is no server-side revocation; rotate `JWT_SECRET` to invalidate all sessions. `secretmanager.googleapis.com` and a bootstrap-managed `roles/secretmanager.admin` binding for the deployer were added, and the deploy workflow now passes Mailtrap and JWT secrets from GitHub environment secrets.

## ADR-011: Separate API service behind a same-origin web proxy

**Status:** The database-migration-image clause is superseded by ADR-012; the separate API service decision stands.

**Decision:** Move the HTTP API into `apps/api`, deployed as a dedicated public Cloud Run service `brainless-chef-<environment>-api`. The web service remains the public origin: it serves the built SPA and reverse-proxies `/api/*` to the API service URL, preserving request headers, bodies, cookies, and `Set-Cookie` responses. The API runtime holds the environment-scoped `roles/datastore.user` grant and reads the Mailtrap and JWT secrets; the web runtime has no Firestore access and receives no application secrets.

**Rationale:** Separating the API from the SPA gives it an independent permission boundary in Google Cloud — the website cannot touch the database directly, and the API is the only gateway to it. Keeping `/api` on the same public origin as the SPA preserves same-origin `HttpOnly` cookies without CORS or a load balancer.

**Consequences:** Web and API services each scale independently under their own runtime identities. The API's `run.app` URL is publicly invokable (`allUsers`), so its magic-link and session-token authentication is the security boundary; `signin` redirects and cookies still pass through the web origin. The web proxy must pass headers, bodies, and `Set-Cookie` verbatim, and development uses Vite's proxy to forward `/api` to the local API server.

## ADR-012: Cloud Tasks-triggered migrator service

**Status:** Adopted.

**Decision:** Move database migrations out of the API container image and out of the Cloud Run Job runner into a dedicated `apps/migrate` application. It ships its own container image (`.../migration:<sha>`) and runs as a Cloud Run service `brainless-chef-<environment>-migrate` whose `/__migrate` endpoint is invoked by a per-environment Cloud Tasks queue. The queue is configured with `max_concurrent_dispatches = 1` and a single attempt (no retries). Each environment gets its own Terraform migrate stack (`infrastructure/environments/<environment>/migrate`) that owns the migrator service, the queue, and their IAM; the deploy workflow applies that stack before the web/API stack, and enqueues a task then polls the migrator's `/__migrate/status/<task>` endpoint until the run reaches a terminal state.

**Rationale:** Migrations typically finish in seconds, but a Cloud Run Job bills a one-minute minimum; a scale-to-zero Cloud Run service bills at 100 ms precision and Cloud Tasks bills per task, eliminating the floor for fast migrations. Splitting `apps/migrate` from `apps/api` gives the migration image an independent artifact and lifecycle (the workflow already assumed a `migration` image path it never built). A per-environment migrate Terraform stack guarantees the migrator deploys ahead of the API by construction, and the queue's single-attempt, single-dispatch policy keeps forward-only semantics: the migration runner's existing fenced lease remains the backstop against concurrent runs in the same environment.

**Consequences:** The `apps/api` image no longer contains migration code, and the `migrate`/`premigrate` scripts are removed. The migrator service is not publicly invokable (`allUsers` has no role); Cloud Tasks reaches it with an OIDC token minted for the migrator service account, and the CI deployer may poll status. Migration status is recorded in a `migration-tasks` collection keyed by the stable task name (`migrate-<environment>-<sha>`), which makes repeated deliveries and workflow re-runs idempotent. The old `brainless-chef-<environment>-migrate` Cloud Run Jobs were replaced; no Terraform ever created them (they were imperative `gcloud` artifacts), so no state migration is required.
