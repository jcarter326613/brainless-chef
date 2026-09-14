# Architecture Decisions

## ADR-001: pnpm workspace

**Decision:** Use one pnpm workspace for the web application and database-migration image source.

**Rationale:** It provides a single lockfile and consistent Node and TypeScript tooling without forcing the web application and migration image into one deployable artifact.

## ADR-002: Cloud Run for compute

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

**Decision:** Map `brainlesschef.com` directly to the production web service through Cloud Run domain mapping and publish its records in the existing Cloud DNS zone.

**Rationale:** This preserves scale-to-zero Cloud Run pricing and avoids a load balancer or reserved IP. Cloud Run manages the TLS certificate. Domain mapping is a Preview feature with documented limitations, so revisit this decision if production reliability or advanced edge controls require a GA load-balancer-based approach.

## ADR-007: Firestore databases isolated by migration IAM

**Decision:** Store recipe data in Firestore Native Mode. Production uses the `(default)` database and development uses a named `development` database. Each environment Terraform state owns its database and future recovery configuration. Each Cloud Run migration Job has a separate runtime service account with `roles/datastore.user` conditioned to its one database; web services have no Firestore data access.

**Rationale:** Firebase Admin SDK requests are authorized with IAM and bypass Firebase Security Rules, while Firestore IAM cannot restrict access to collection paths inside one database. Separate databases are therefore required for an enforced environment boundary. Environment-owned state keeps backup, retention, and recovery choices independent. The production default database retains the single Firestore free quota, and neither database has idle compute cost.

## ADR-008: Validated repositories and forward-only Firestore migrations

**Decision:** Define application Zod schemas and optional storage migrations in `packages/database`, then configure the connection-owning [`firestore-database`](https://github.com/jcarter326613/firestore-database) facade. The facade strips fields outside the running schema on reads. Application releases retain old fields and make new fields optional while versions overlap; release engineers own that compatibility contract. Hidden per-document migration versions reference ordered migration IDs in the Firestore ledger. Run storage migrations in a dedicated Cloud Run Job; each source-document transaction can read related documents, generate Firestore IDs, write related documents, and advance that source document's migration version.

**Rationale:** Firestore has no DDL schema, migration table, or collection-wide lock. A durable ledger records ordered storage changes and a fenced lease prevents concurrent runners. Per-document transactions make large changes restartable while allowing unrelated production work to continue. The application owns release compatibility by retaining old fields and keeping new fields optional during an overlap. Dedicated jobs keep migration execution separate from the web service. Release engineers remain responsible for preserving old query fields until an explicit storage migration completes.

## ADR-009: Private API and CPU inference Job (superseded)

**Status:** Superseded.

**Superseded by:** Removal of the deployed HTTP API, worker, and inference-job flow. `apps/worker` remains a local Qwen prompt experiment with no deployment integration.
