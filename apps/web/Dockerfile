# Контекст сборки — корень монорепо. Собирать: docker build -f apps/web/Dockerfile .
# Собирает SPA и отдаёт его через Caddy с авто-HTTPS + проксированием /api.
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/web apps/web
RUN npm run build -w @capi/web

FROM caddy:2-alpine
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/apps/web/dist /srv
EXPOSE 80 443
