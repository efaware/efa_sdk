FROM node:24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf AS builder

ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

WORKDIR /app

# Copy frontend deps first for layer caching
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci

# Copy frontend source (@efa-one/sdk kommt via npm ci aus node_modules)
COPY frontend/ ./frontend/

# Skip tsc type-check in Docker — Vite handles the actual bundling with its own
# TS transform; @efa-one/sdk wird aus node_modules aufgelöst.
RUN cd frontend && npx vite build

# ─── Runtime image ────────────────────────────────────────────────────────────
# nginx-unprivileged (offizielles nginx-Org-Image, BSD-2): läuft als non-root
# User `nginx` (uid 101), lauscht auf 8080 statt 80, pid + temp-Pfade unter /tmp.
# Damit non-root + read-only-Rootfs ohne manuelles Verbiegen (Findings #2/#22).
FROM nginxinc/nginx-unprivileged:alpine@sha256:334d92979f15aaecd5dd50af5105e1230e2bb70765d45b1e2f964e7c5eda81c3

COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Container-Port 8080 (unprivilegiert); der Host-Port (FRONTEND_PORT) bleibt gleich,
# nur das Mapping im Compose zeigt jetzt auf :8080.
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
