FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS builder

WORKDIR /app

# Copy backend deps first for layer caching
COPY backend/package*.json ./backend/
RUN cd backend && npm ci

# Copy source files (template-core kommt als npm-Dep @efa-one/sdk via npm ci)
COPY backend/tsconfig.json ./backend/
COPY backend/src/ ./backend/src/

# Build TypeScript
# rootDir is "src" → output structure: backend/dist/ (dist/index.js, dist/db/…)
RUN cd backend && npm run build

# Copy non-TS assets (schema.sql etc.) to compiled output location.
# Apps that bundle additional non-TS files (YAML configs, templates, etc.)
# should add their own COPY/RUN steps here.
RUN cp backend/src/db/schema.sql backend/dist/db/schema.sql

# ─── Runtime image ────────────────────────────────────────────────────────────
FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf

WORKDIR /app

# APP_VERSION wird vom CI/CD-Workflow als Build-Arg durchgereicht (entspricht dem
# GHCR-Image-Tag). Backend-Code liest sie via process.env.APP_VERSION und kann sie
# z.B. als Default-Dimension in reporting/audit-Events mitgeben — beim Debugging
# weiß man dann, gegen welche Backend-Version eine Zeile geschrieben wurde.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

ENV NODE_ENV=production

# Non-root-Runtime-User. Build-Stage oben bleibt root (ephemer, unkritisch) —
# hier zählt nur, dass der LAUFENDE Prozess kein root ist (Finding #2).
RUN addgroup -S app && adduser -S app -G app

COPY --from=builder /app/backend/package*.json ./
# npm nach dem Prod-Install wieder entfernen: der Runtime-Prozess startet mit
# `node`, npm wird nie gebraucht. Beseitigt CVE-2026-59873 (node-tar DoS im
# gebündelten npm des Base-Images, nur ein Build-Tool) + verkleinert die
# Angriffsfläche. Trivy scannt das gemergte FS → das entfernte npm ist weg.
RUN npm ci --omit=dev \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /root/.npm

COPY --from=builder /app/backend/dist ./dist

# Deploy-Bundle: converge-deployer extracted diese Files beim Installieren,
# um Stack-Layout + erwartete ENV-Keys aus dem Image zu lesen.
COPY docker-compose.yml /app/docker-compose.yml
COPY .env.example /app/.env.example

EXPOSE 3001
USER app

# Docker-HEALTHCHECK (Finding #29) auf den /health-Endpoint; busybox-wget vorhanden.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3001/health || exit 1

CMD ["node", "dist/index.js"]
