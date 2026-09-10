# Brainless Chef

Brainless Chef is a TypeScript monorepo containing a React web application, an Express API, and Terraform for Google Cloud deployment.

## Prerequisites

- Node.js 22 or later
- pnpm 11 or later
- Terraform 1.9 or later
- Google Cloud CLI, authenticated to a principal that can perform the one-time bootstrap

## Local development

```sh
corepack enable
pnpm install
pnpm dev
```

- Web: `http://localhost:5173`
- API health check: `http://localhost:8080/health`

Run the full local verification suite with:

```sh
pnpm check
```

## Repository layout

- `apps/api`: Express API deployed to Cloud Run.
- `apps/web`: React/Vite web application deployed to Cloud Run.
- `packages/database`: Server-only Zod schemas, validated repositories, and application migrations built on [`firestore-database`](https://github.com/jcarter326613/firestore-database).
- `docs`: architecture, operational guidance, and recorded decisions.
- `infrastructure/bootstrap`: one-time project bootstrap, including remote state and GitHub OIDC.
- `infrastructure/environments`: independently deployed development and production environments.

See [`docs/architecture.md`](docs/architecture.md) before making cross-cutting changes, and [`docs/infrastructure.md`](docs/infrastructure.md) before deploying.
