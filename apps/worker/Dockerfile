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

ARG MODEL_REVISION=bb5d59e06d9551d752d08b292a50eb208b07ab1f
ARG MODEL_FILE_PART_1=qwen2.5-7b-instruct-q4_k_m-00001-of-00002.gguf
ARG MODEL_FILE_PART_2=qwen2.5-7b-instruct-q4_k_m-00002-of-00002.gguf
ARG MODEL_SHA256_PART_1=dfce12e3862a5283ccfb88221b48480e58745165de856439950d0f22590580db
ARG MODEL_SHA256_PART_2=539cf93f78e887edea1c04e2d7d8cdaca9d01dae9c9025bcb8accbe29df3d72a

WORKDIR /workspace
RUN corepack enable
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates curl libgomp1 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/database/package.json packages/database/package.json
RUN pnpm install --filter @brainless-chef/worker... --prod --frozen-lockfile

COPY --from=build --chown=node:node /workspace/apps/worker/dist apps/worker/dist
COPY --from=build --chown=node:node /workspace/packages/database/dist packages/database/dist
RUN mkdir /models \
  && curl --fail --location --retry 5 \
    "https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/${MODEL_REVISION}/${MODEL_FILE_PART_1}" \
    --output "/models/${MODEL_FILE_PART_1}" \
  && curl --fail --location --retry 5 \
    "https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/${MODEL_REVISION}/${MODEL_FILE_PART_2}" \
    --output "/models/${MODEL_FILE_PART_2}" \
  && echo "${MODEL_SHA256_PART_1}  /models/${MODEL_FILE_PART_1}" | sha256sum --check \
  && echo "${MODEL_SHA256_PART_2}  /models/${MODEL_FILE_PART_2}" | sha256sum --check \
  && curl --fail --location --retry 5 \
    "https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/${MODEL_REVISION}/LICENSE" \
    --output /models/MODEL-LICENSE \
  && chown -R node:node /models

ENV MODEL_PATH=/models/qwen2.5-7b-instruct-q4_k_m-00001-of-00002.gguf
ENV NODE_ENV=production

RUN FIRESTORE_DATABASE_ID=worker-evaluation node apps/worker/dist/evaluate.js

USER node
CMD ["node", "apps/worker/dist/index.js"]
