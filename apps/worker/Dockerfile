FROM debian:bookworm-slim AS model

ARG MODEL_REVISION=91cad51170dc346986eccefdc2dd33a9da36ead9
ARG MODEL_FILE=qwen2.5-1.5b-instruct-q4_k_m.gguf
ARG MODEL_SHA256=6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
RUN mkdir /models \
  && curl --fail --location --retry 5 \
    "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/${MODEL_REVISION}/${MODEL_FILE}" \
    --output "/models/${MODEL_FILE}" \
  && echo "${MODEL_SHA256}  /models/${MODEL_FILE}" | sha256sum --check \
  && curl --fail --location --retry 5 \
    "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/${MODEL_REVISION}/LICENSE" \
    --output /models/MODEL-LICENSE

FROM node:22-bookworm-slim AS build

WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/database/package.json packages/database/package.json
RUN pnpm install --filter @brainless-chef/worker... --frozen-lockfile

COPY apps/worker apps/worker
COPY packages packages
RUN pnpm --filter @brainless-chef/worker... build

FROM node:22-bookworm-slim AS runtime-base

WORKDIR /workspace
RUN corepack enable
RUN apt-get update \
  && apt-get install --yes --no-install-recommends libgomp1 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/database/package.json packages/database/package.json
RUN pnpm install --filter @brainless-chef/worker... --prod --frozen-lockfile

COPY --from=build --chown=node:node /workspace/apps/worker/dist apps/worker/dist
COPY --from=build --chown=node:node /workspace/packages/database/dist packages/database/dist
COPY --from=model --chown=node:node /models /models

FROM runtime-base

RUN node apps/worker/dist/smoke.js

ENV MODEL_PATH=/models/qwen2.5-1.5b-instruct-q4_k_m.gguf
ENV NODE_ENV=production
USER node
CMD ["node", "apps/worker/dist/index.js"]
