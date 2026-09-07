# Architecture Decisions

## ADR-001: pnpm workspace

**Decision:** Use one pnpm workspace for the web and API projects.

**Rationale:** It provides a single lockfile and consistent Node and TypeScript tooling without forcing both applications into one deployable artifact.

## ADR-002: Cloud Run for compute

**Decision:** Deploy web and API as separate Cloud Run services in `us-east1`.

**Rationale:** Cloud Run permits scale-to-zero stateless services, requires no server maintenance, and keeps the independently changing client and API deployable separately. Separate services also preserve the option to make the API private later.

## ADR-003: GCS remote Terraform state

**Decision:** Use a versioned, non-public regional GCS bucket for environment Terraform state.

**Rationale:** Remote state supports CI deployment and recovery from an accidental state change. Versioning is low-cost protection against state corruption. Bootstrap state remains local because it creates the bucket needed by remote backends.

## ADR-004: GitHub OIDC federation

**Decision:** Authenticate GitHub Actions with Workload Identity Federation restricted to `jcarter326613/brainless-chef`.

**Rationale:** Short-lived federated credentials remove secret rotation and the risk of a long-lived service-account JSON key. A repository attribute condition prevents identities from other GitHub repositories using the provider.

## ADR-005: Public initial services

**Decision:** Make the initial web and API Cloud Run services publicly invokable.

**Rationale:** The site needs a public entry point and the placeholder API has no protected behavior. This decision must be revisited before the API handles personal data, authenticated users, mutations, payment details, or other sensitive operations.

## ADR-006: Production custom domain through Cloud Run mapping

**Decision:** Map `brainlesschef.com` directly to the production web service through Cloud Run domain mapping and publish its records in the existing Cloud DNS zone.

**Rationale:** This preserves scale-to-zero Cloud Run pricing and avoids a load balancer or reserved IP. Cloud Run manages the TLS certificate. Domain mapping is a Preview feature with documented limitations, so revisit this decision if production reliability or advanced edge controls require a GA load-balancer-based approach.

## ADR-007: Firestore databases isolated by API IAM

**Decision:** Store recipe data in Firestore Native Mode. Production uses the `(default)` database and development uses a named `development` database. Each environment Terraform state owns its database and future recovery configuration. Each Cloud Run API has a separate runtime service account with `roles/datastore.user` conditioned to its one database; web services have no Firestore data access.

**Rationale:** Firebase Admin SDK requests are authorized with IAM and bypass Firebase Security Rules, while Firestore IAM cannot restrict access to collection paths inside one database. Separate databases are therefore required for an enforced environment boundary. Environment-owned state keeps backup, retention, and recovery choices independent. The production default database retains the single Firestore free quota, and neither database has idle compute cost.
