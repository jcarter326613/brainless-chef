FROM node:22-alpine AS build

WORKDIR /workspace
RUN corepack enable

COPY . .
RUN pnpm install --filter @brainless-chef/migrate... --frozen-lockfile
RUN pnpm --filter @brainless-chef/migrate... build \
  && pnpm --filter @brainless-chef/migrate deploy --legacy --prod /app

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app ./
USER node
CMD ["node", "dist/migrate-server.js"]
