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

The API initializes its typed Firestore facade before listening. Configure Application Default Credentials, select the development database, and apply pending migrations before running the API:

```sh
gcloud auth application-default login
export FIRESTORE_DATABASE_ID=development
pnpm --filter @brainless-chef/api migrate
pnpm dev
```

The migration command accesses the shared development database with your current Application Default Credentials. Run it only with an identity intentionally granted access to that database. When using a Firestore emulator, also set `FIRESTORE_EMULATOR_HOST`; never point emulator work at production.

## VS Code debugging

Open the Run and Debug view in VS Code and choose one of these configurations:

- `API: Run Locally` starts only the API in an integrated terminal.
- `Web: Debug with Local API` runs the root `pnpm dev` command to start both applications, then opens Chrome under the browser debugger. Set React/TypeScript breakpoints in `apps/web/src`.

The web app does not yet call the API, but the compound configuration keeps the local API ready for those requests as the client grows.

## Verify changes

```sh
pnpm check
terraform fmt -check -recursive infrastructure
```

`pnpm check` typechecks and builds both deployed applications. Do not build deployment container images locally. GitHub Actions is the only supported image build path for the API and web applications.

## Configuration

Cloud Run supplies the API's `PORT` and `FIRESTORE_DATABASE_ID`. Local API development defaults only the port to `8080`. Do not commit `.env` files. Add a documented `.env.example` only when an application requires local configuration.

The deployed API requires Cloud Run IAM authentication. A caller granted `roles/run.invoker` can call its health endpoint with:

```sh
API_URL="$(terraform -chdir=infrastructure/environments/development output -raw api_url)"
TOKEN="$(gcloud auth print-identity-token)"
curl -H "Authorization: Bearer ${TOKEN}" "${API_URL}/health"
```
