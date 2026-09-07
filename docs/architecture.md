# Architecture

## Scope

Brainless Chef is a small-volume web product composed of two independently deployable TypeScript applications:

- `apps/web` is a React single-page application built with Vite and served from a Cloud Run container.
- `apps/api` is an Express HTTP API deployed as a separate Cloud Run service.

Each service is stateless. Persistent services such as a database, object storage, or queue are intentionally absent until a product requirement justifies them.

## Request flow

```text
Browser
  -> Cloud Run web service
  -> Cloud Run API service (when the web client calls it)
```

Cloud Run owns TLS termination, request routing, health management, and horizontal scaling. Containers listen on `PORT` (Cloud Run supplies it, normally `8080`) and must not depend on local filesystem persistence or in-memory session state.

## Environment boundaries

Development and production have separate Cloud Run services and Terraform state prefixes. Both currently live in Google Cloud project `brainlesschef`, region `us-east1`; separate projects can be introduced later if stronger organizational isolation becomes necessary.

Initial services allow unauthenticated invocation so the website and API can be reached directly. This is only appropriate while the API exposes no sensitive or data-changing functionality. Authentication and authorization must be designed before adding such endpoints.

## Identity boundaries

- A human administrator applies `infrastructure/bootstrap` one time with elevated project access.
- GitHub Actions exchanges its GitHub-issued OIDC token for the `brainless-chef-deployer` service account. No JSON key is created or stored.
- The federated identity is restricted to `jcarter326613/brainless-chef`.
- CI receives only image-publishing, Cloud Run administration, Terraform-state access, service-usage, and permission to attach the pre-created runtime identities.
- Cloud Run services use a dedicated runtime service account per environment. It has no project roles until an application integration requires one.

## Cost posture

Cloud Run services set `min_instance_count` to zero, cap at two instances, use 256 MiB of memory, and use one vCPU. This minimizes idle cost and limits accidental scaling for expected low traffic. The trade-off is occasional cold starts.

Artifact Registry and the versioned Terraform state bucket are regional in `us-east1`. State remains private through uniform bucket-level access and enforced public-access prevention.
