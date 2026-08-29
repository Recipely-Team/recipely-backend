# syntax=docker/dockerfile:1.7

# Single `npm ci` for the whole pipeline — running two in parallel competes
# for CPU/RAM on the 1 OCPU / 1GB Oracle host and DOUBLES the total time.
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# Pruned production-only node_modules. Inherits from `deps`, runs prune on
# its existing node_modules (no re-install). This whole stage is *cacheable*
# when package.json/lock haven't changed, so the runtime COPY below is
# instantaneous on code-only deploys (the 4-minute node_modules transfer
# was the actual deploy bottleneck).
FROM deps AS prod-deps
RUN npm prune --omit=dev

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
# Alpine's `yt-dlp` package lags months behind upstream, and Instagram breaks
# every stale extractor ("Instagram sent an empty media response" / "login
# required" on posts that are publicly reachable). Ship the official zipapp
# pinned to a known-good release instead — bump YTDLP_VERSION + YTDLP_SHA256
# together (sha256 from the release's SHA2-256SUMS) when import starts failing.
ARG YTDLP_VERSION=2026.07.04
ARG YTDLP_SHA256=495be29ff4d9d4e9be7eabdfef225221e5d5282e77f2f505abc6dca80349f3fd
RUN apk add --no-cache openssl libc6-compat tini ffmpeg python3 \
 && wget -qO /usr/local/bin/yt-dlp "https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp" \
 && echo "${YTDLP_SHA256}  /usr/local/bin/yt-dlp" | sha256sum -c - \
 && chmod 0755 /usr/local/bin/yt-dlp \
 && addgroup -S app && adduser -S app -G app \
 && mkdir -p /app/public/uploads \
 && chown -R app:app /app
# prod-deps layer is cacheable across deploys; build-stage output is not.
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
