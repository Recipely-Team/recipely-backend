# syntax=docker/dockerfile:1.7

# Production-only node_modules. This layer is *cacheable* across deploys when
# package.json/package-lock.json haven't changed, which is the common case for
# code-only changes. We keep it isolated from the build stage so `npm prune`
# never mutates it (the previous Dockerfile pruned in-place after `COPY . .`,
# which invalidated the cache for every commit and forced a 4-minute
# node_modules COPY into runtime on every deploy).
FROM node:20-alpine AS prod-deps
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund

# Full deps (incl. dev) for tsc + prisma generate.
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN NODE_OPTIONS="--max-old-space-size=1024" npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=320"
RUN apk add --no-cache openssl libc6-compat tini \
 && addgroup -S app && adduser -S app -G app \
 && chown app:app /app
# Cacheable: production node_modules from prod-deps stage (unchanged when
# package.json is unchanged). Then overlay the generated Prisma client on top.
COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=app:app /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/package.json ./package.json
USER app
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/presentation/server/index.js"]
