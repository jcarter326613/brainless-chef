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

This starts the Express API at `http://localhost:8080` and Vite at `http://localhost:5173`. Confirm the API is running with:

```sh
curl http://localhost:8080/health
```

## Verify changes

```sh
pnpm check
terraform fmt -check -recursive infrastructure
```

`pnpm check` typechecks and builds both applications. The production containers build from the repository root because the pnpm lockfile is shared:

```sh
docker build --file apps/api/Dockerfile --tag brainless-chef-api:local .
docker build --file apps/web/Dockerfile --tag brainless-chef-web:local .
```

## Configuration

Cloud Run supplies the API's `PORT`; local development defaults it to `8080`. Do not commit `.env` files. Add a documented `.env.example` only when an application requires local configuration.
