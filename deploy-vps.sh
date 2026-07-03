#!/usr/bin/env bash
# Полный деплой CAPI на VPS (Ubuntu/Debian). Запускать от root или через sudo:
#   curl -fsSL https://raw.githubusercontent.com/FlyInTheSkyAndOfTheDarkness/CAPI/main/deploy-vps.sh | sudo bash
# либо: git clone ... && cd CAPI && sudo bash deploy-vps.sh
set -euo pipefail

DOMAIN="capi.garden"
REPO="https://github.com/FlyInTheSkyAndOfTheDarkness/CAPI.git"
APP_DIR="/opt/capi"

echo "==> CAPI deploy на $DOMAIN"

# 1. Docker + compose-плагин
if ! command -v docker >/dev/null 2>&1; then
  echo "==> Ставлю Docker..."
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || { echo "compose-плагин не найден"; exit 1; }

# 2. Фаервол (если ufw активен) — открыть 22/80/443
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  echo "==> Открываю порты 22/80/443 в ufw..."
  ufw allow 22/tcp  || true
  ufw allow 80/tcp  || true
  ufw allow 443/tcp || true
fi

# 3. Код
if [ -d "$APP_DIR/.git" ]; then
  echo "==> Обновляю репозиторий..."
  git -C "$APP_DIR" pull --ff-only
else
  echo "==> Клонирую репозиторий в $APP_DIR..."
  git clone "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

# 4. Секреты и окружение (генерируются один раз)
if [ ! -f .env.prod ]; then
  echo "==> Генерирую .env.prod со случайными секретами..."
  cp .env.prod.example .env.prod
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 16)|" .env.prod
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env.prod
  sed -i "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$(openssl rand -hex 32)|" .env.prod
  sed -i "s|^WEB_ORIGIN=.*|WEB_ORIGIN=https://$DOMAIN|" .env.prod
  sed -i "s|^PUBLIC_API_URL=.*|PUBLIC_API_URL=https://$DOMAIN|" .env.prod
  echo "    .env.prod создан (секреты сохранены — не теряйте ENCRYPTION_KEY!)"
else
  echo "==> .env.prod уже есть — использую существующий"
fi

# 5. Сборка и запуск
echo "==> Собираю и запускаю стек (первый раз — несколько минут)..."
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

echo ""
echo "==> Готово. Статус:"
docker compose -f docker-compose.prod.yml ps
echo ""
echo "Caddy выпускает TLS-сертификаты для $DOMAIN при первом обращении (10-60 сек)."
echo "Откройте: https://$DOMAIN"
echo ""
echo "Redirect URI для интеграции amoCRM:"
echo "  https://$DOMAIN/api/connections/amocrm/callback"
echo ""
echo "Логи:     docker compose -f docker-compose.prod.yml logs -f"
echo "Обновить: cd $APP_DIR && git pull && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build"
