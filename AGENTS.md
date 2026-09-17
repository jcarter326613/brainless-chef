# AGENTS.md

Guidance for coding agents working in this repository. These rules are binding; follow them unless the user explicitly overrides a convention.

## Code style

### Classes, not factory functions
Services, controllers, and adapters are **classes** with constructor-injected dependencies. Each class is wrapped by an interface so call sites depend on the abstraction, and tests can substitute a fake.

- Model implementations: `MailService`/`Mailer` in `apps/api/src/services/mail-service.ts`, `AuthController` in `apps/api/src/controllers/auth.ts`.
- Do **not** introduce `create*` factory functions that construct a service/controller/adaptor (e.g. no `createTokenService`, `createUserService`, `createGoogleParameterRenderer`). Pure helper functions that return a string or a small value (not wrapping a client/runtime) are fine.
- Accepted exception: Express `createApp`/`createAuthRouter` factories. UI/logic modules may keep small pure helpers.

### General
- Do not add comments unless the code genuinely needs explanation (e.g. non-obvious Terraform ordering or IAM decisions).
- Do not add emojis to code or docs.

## Structure and workflow

- `apps/api` tests live in `apps/api/test-unit/**` and `apps/api/test-integration/**` (mirror `src/` layout). `apps/worker` uses `test-unit` and `test-integration`. Do not create a `test/` dir for apps.
- Verify work with `corepack pnpm check` (typecheck + build + test across the workspace). Mind the `corepack` prefix.
- Dockerfiles: never `COPY` files from other apps or packages; the unified image build is pnpm-import only.
- Terraform: run `terraform fmt -check -recursive infrastructure` and `terraform validate` on affected stacks after changes.

## Decisions that are settled

- Use Terraform for infrastructure; Secret Manager and Parameter Manager hold runtime values (never in Terraform state or env-var secrets from the workflow).
- Database migrations run automatically on every Deploy via Cloud Tasks; do not edit completed migrations.