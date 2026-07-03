# Контекст сборки — корень монорепо. Собирать: docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS builder
WORKDIR /app
# package.json всех воркспейсов нужны для npm ci (workspaces)
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/api apps/api
RUN npm run prisma:generate -w @capi/api && npm run build -w @capi/api

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# Тянем установленные зависимости (включая сгенерированный Prisma client) и сборку
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/api ./apps/api
WORKDIR /app/apps/api
EXPOSE 3001
# Применяем схему к БД и запускаем API
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/main.js"]
