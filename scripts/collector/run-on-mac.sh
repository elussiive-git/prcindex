#!/bin/bash
# Запуск сборщика на своём Mac (российский адрес — сайты чаще показывают ИНН).
# По умолчанию — режим strict: перепроверка карточек, снятых строгой проверкой.
# Запуск:  bash ~/Downloads/prcindex-mac.sh
set -e
MODE="${1:-strict}"
DIR="$HOME/prcindex-collector"
echo "== Сборщик prcindex, режим: $MODE"
if ! command -v node >/dev/null 2>&1; then
  echo "Не найден Node.js. Установите его с https://nodejs.org (кнопка LTS), затем запустите эту команду снова."
  exit 1
fi
echo "Node.js: $(node -v)"
rm -rf "$DIR.tmp" && mkdir -p "$DIR.tmp"
echo "== Скачиваю сборщик с GitHub…"
curl -sL https://codeload.github.com/elussiive-git/prcindex/tar.gz/refs/heads/main | tar -xz -C "$DIR.tmp" --strip-components=3 prcindex-main/scripts/collector
rm -rf "$DIR" && mv "$DIR.tmp" "$DIR" && cd "$DIR"
echo "== Устанавливаю зависимости (первый раз — несколько минут)…"
npm install --no-audit --no-fund --silent
npx playwright install chromium
echo
echo "Вставьте секретный ключ Supabase (Supabase → Project Settings → API Keys → secret) и нажмите Enter."
echo "Символы при вводе не отображаются — так и должно быть."
read -rs KEY
echo
[ -z "$KEY" ] && { echo "Ключ не введён."; exit 1; }
echo "== Запуск. Не закрывайте окно Терминала и не выключайте компьютер, пока не появятся строки «Готово: … компаний» и «== Готово»."
caffeinate -i env SUPABASE_URL=https://llhgagharnhyylbrcxwm.supabase.co SUPABASE_SECRET_KEY="$KEY" MODE="$MODE" SHARD=0 SHARDS=1 CONCURRENCY=4 node collect.mjs
echo "== Готово. Окно можно закрыть."
