# Architecture Decisions

## ADR-001: pnpm workspace

**Decision:** Use one pnpm workspace for the web and API projects.

**Rationale:** It provides a single lockfile and consistent Node and TypeScript tooling without forcing both applications into one deployable artifact.

## ADR-002: Cloud Run for compute

**Decision:** Deploy web and API as separate Cloud Run services in `us-east1`.

**Rationale:** Cloud Run permits scale-to-zero stateless services, requires no server maintenance, and keeps the independently changing client and API deployable separately. Separate services also preserve the option to make the API private later.

## ADR-003: GCS remote Terraform state

**Decision:** Store every Terraform stack's state in a versioned, non-public regional GCS bucket. Local Terraform state is prohibited, including for the bootstrap stack.

**Rationale:** Remote state supports shared deployment, locking, and recovery from an accidental state change. Versioning is low-cost protection against state corruption. Because Terraform cannot create the bucket that contains its state before backend initialization, a trusted administrator creates that one prerequisite with Google Cloud CLI and imports it into the bootstrap's remote state.

## ADR-004: GitHub OIDC federation

**Decision:** Authenticate GitHub Actions with Workload Identity Federation restricted to `jcarter326613/brainless-chef`.

**Rationale:** Short-lived federated credentials remove secret rotation and the risk of a long-lived service-account JSON key. A repository attribute condition prevents identities from other GitHub repositories using the provider.

## ADR-005: Public initial services

**Decision:** Make the initial web and API Cloud Run services publicly invokable. Superseded for the API by ADR-009.

**Rationale:** The site needs a public entry point and the placeholder API has no protected behavior. This decision must be revisited before the API handles personal data, authenticated users, mutations, payment details, or other sensitive operations.

## ADR-006: Production custom domain through Cloud Run mapping

**Decision:** Map `brainlesschef.com` directly to the production web service through Cloud Run domain mapping and publish its records in the existing Cloud DNS zone.

**Rationale:** This preserves scale-to-zero Cloud Run pricing and avoids a load balancer or reserved IP. Cloud Run manages the TLS certificate. Domain mapping is a Preview feature with documented limitations, so revisit this decision if production reliability or advanced edge controls require a GA load-balancer-based approach.

## ADR-007: Firestore databases isolated by API IAM

**Decision:** Store recipe data in Firestore Native Mode. Production uses the `(default)` database and development uses a named `development` database. Each environment Terraform state owns its database and future recovery configuration. Each Cloud Run API has a separate runtime service account with `roles/datastore.user` conditioned to its one database; web services have no Firestore data access.

**Rationale:** Firebase Admin SDK requests are authorized with IAM and bypass Firebase Security Rules, while Firestore IAM cannot restrict access to collection paths inside one database. Separate databases are therefore required for an enforced environment boundary. Environment-owned state keeps backup, retention, and recovery choices independent. The production default database retains the single Firestore free quota, and neither database has idle compute cost.

## ADR-008: Validated repositories and forward-only Firestore migrations

**Decision:** Define application Zod schemas and optional storage migrations in `packages/database`, then configure the connection-owning [`firestore-database`](https://github.com/jcarter326613/firestore-database) facade. The facade strips fields outside the running schema on reads. Application releases retain old fields and make new fields optional while versions overlap; release engineers own that compatibility contract. Hidden per-document migration versions reference ordered migration IDs in the Firestore ledger. Run storage migrations in a dedicated Cloud Run Job; each source-document transaction can read related documents, generate Firestore IDs, write related documents, and advance that source document's migration version.

**Rationale:** Firestore has no DDL schema, migration table, or collection-wide lock. A durable ledger records ordered storage changes and a fenced lease prevents concurrent runners. Per-document transactions make large changes restartable while allowing unrelated production work to continue. The application owns release compatibility by retaining old fields and keeping new fields optional during an overlap. Dedicated jobs avoid API startup timeouts. Release engineers remain responsible for preserving old query fields until an explicit storage migration completes.

## ADR-009: Private API and CPU inference Job

**Decision:** Keep the web service public, require Cloud Run IAM authentication for the API, and execute recipe ingestion in a non-public CPU Cloud Run Job. The API persists a strict Firestore job document before starting one worker execution with only the document ID as an override. The worker bundles the Apache-2.0 Qwen2.5 7B Instruct Q4_K_M GGUF and uses a dedicated Firestore identity. It extracts grounded facts, resolves catalog ingredients, plans material flow, then deterministically validates and persists a recipe. Semantically invalid model output fails the job.

**Rationale:** Starting inference is a data-changing, billed operation, so a public API is no longer acceptable. A Cloud Run Job provides scale-to-zero CPU without relying on request lifetime or detached API work. The 1.5B model did not meet the minimum extraction-quality bar; the 7B model improves instruction following while remaining within the Job's 8-vCPU, 16-GiB baseline. The Firestore record makes results observable and permits transactional claiming, while a dedicated queue, batching, leases, and retries remain unnecessary for the first benchmark.
