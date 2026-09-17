FROM node:22-alpine AS build

WORKDIR /workspace
RUN corepack enable

COPY . .
RUN pnpm install --filter @brainless-chef/web... --frozen-lockfile
RUN pnpm --filter @brainless-chef/web... build \
  && pnpm --filter @brainless-chef/web deploy --legacy --prod /app

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 8080
CMD ["sh", "-c", "node dist-server/server.js"]
