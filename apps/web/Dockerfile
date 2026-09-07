FROM node:22-alpine AS build

WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY apps/web apps/web
RUN pnpm --filter @brainless-chef/web build \
  && pnpm --filter @brainless-chef/web deploy --legacy --prod /app

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 8080
CMD ["sh", "-c", "node_modules/.bin/serve -s dist -l tcp://0.0.0.0:${PORT:-8080}"]
