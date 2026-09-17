# Local Development

## Setup

```sh
corepack enable
pnpm install
```

Use Node 22 or newer. The repository pins pnpm through the root `packageManager` field.

## Run applications

```sh
pnpm dev
```

This starts Vite at `http://localhost:5173`.

`apps/api` and `apps/migrate` have no local development servers. `apps/api` runs as the Cloud Run API gateway; `apps/migrate` is the source for the Cloud Run database-migration service. Database migrations run automatically on every `Deploy`, as described in [`infrastructure.md`](infrastructure.md#deployment).

## VS Code debugging

Open the Run and Debug view in VS Code and choose `Web: Debug`, which starts Vite and opens Chrome under the browser debugger. Set React/TypeScript breakpoints in `apps/web/src`.

## Verify changes

```sh
pnpm check
terraform fmt -check -recursive infrastructure
```

`pnpm check` typechecks and builds workspace packages. Do not build deployment container images locally. GitHub Actions is the only supported image build path for the migration and web images.

## Configuration

Cloud Run supplies the web service's `PORT`. Do not commit `.env` files. Add a documented `.env.example` only when an application requires local configuration.
