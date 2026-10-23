#!/usr/bin/env sh
set -eu

# ALFA FLOW bootstrap for macOS and Linux.
# It can be run from a checkout or directly from GitHub:
#   curl -fsSL https://raw.githubusercontent.com/NIDJEL/alfa-flow/main/scripts/install.sh | sh

REPO_URL="${ALFA_FLOW_REPO_URL:-https://github.com/NIDJEL/alfa-flow.git}"
REPO_REF="${ALFA_FLOW_REF:-main}"
TARGET_DIR="${ALFA_FLOW_DIR:-$HOME/alfa-flow}"
APP_URL="${ALFA_FLOW_URL:-http://localhost:8088}"
OPEN_BROWSER="${ALFA_FLOW_OPEN_BROWSER:-1}"
INSTALL_DOCKER="${ALFA_FLOW_INSTALL_DOCKER:-1}"
WAIT_SECONDS="${ALFA_FLOW_WAIT_SECONDS:-300}"
USE_SUDO=0
TEMP_DIR=""
DMG_MOUNT=""

cleanup() {
  if [ -n "$DMG_MOUNT" ]; then
    hdiutil detach "$DMG_MOUNT" >/dev/null 2>&1 || true
  fi
  if [ -n "$TEMP_DIR" ]; then
    rm -rf -- "$TEMP_DIR"
  fi
}
trap cleanup 0
trap 'exit 130' INT
trap 'exit 143' TERM

info() {
  printf '\033[1;34m[ALFA FLOW]\033[0m %s\n' "$*"
}

fail() {
  printf '\033[1;31m[ALFA FLOW]\033[0m %s\n' "$*" >&2
  exit 1
}

has_command() {
  command -v "$1" >/dev/null 2>&1
}

download() {
  # Download to a file first: a failed pipe must never look like a successful install.
  has_command curl || fail "Не найден curl. Установите curl и повторите запуск."
  curl --fail --show-error --location --retry 3 --connect-timeout 20 "$1" --output "$2"
}

temp_dir() {
  if [ -z "$TEMP_DIR" ]; then
    TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/alfa-flow.XXXXXXXX")"
  fi
}

as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif has_command sudo; then
    sudo "$@"
  else
    fail "Нужны root или sudo для установки Docker. Затем повторите эту команду."
  fi
}

docker_exec() {
  if [ "$USE_SUDO" -eq 1 ]; then
    sudo docker "$@"
  else
    docker "$@"
  fi
}

find_checkout() {
  candidate=""
  script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" 2>/dev/null && pwd || true)"
  for candidate in \
    "$PWD" \
    "$(CDPATH= cd -- "$script_dir/.." 2>/dev/null && pwd || true)" \
    "$TARGET_DIR"; do
    if [ -f "$candidate/docker-compose.yml" ] &&
       [ -f "$candidate/backend/go.mod" ] &&
       [ -f "$candidate/web/package.json" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

clone_checkout() {
  if [ -e "$TARGET_DIR" ] && { [ ! -d "$TARGET_DIR" ] ||
     [ -n "$(ls -A "$TARGET_DIR")" ]; }; then
    fail "Каталог $TARGET_DIR уже существует и не похож на ALFA FLOW. Укажите ALFA_FLOW_DIR или очистите каталог."
  fi

  mkdir -p "$(dirname "$TARGET_DIR")"
  if [ -d "$TARGET_DIR" ]; then
    rmdir "$TARGET_DIR" 2>/dev/null || true
  fi

  info "Скачиваю исходники в $TARGET_DIR"
  if has_command git; then
    git clone --depth 1 --branch "$REPO_REF" "$REPO_URL" "$TARGET_DIR"
    return
  fi

  has_command curl || fail "Не найден curl. Установите curl и повторите запуск."
  has_command tar || fail "Не найден tar. Установите tar и повторите запуск."

  temp_dir
  repo_base="$(printf '%s' "$REPO_URL" | sed 's/\.git$//')"
  archive_url="$repo_base/archive/refs/heads/$REPO_REF.tar.gz"
  download "$archive_url" "$TEMP_DIR/source.tar.gz"
  mkdir "$TEMP_DIR/source"
  tar -xzf "$TEMP_DIR/source.tar.gz" -C "$TEMP_DIR/source" --strip-components=1
  [ -f "$TEMP_DIR/source/backend/go.mod" ] || fail "Некорректный архив репозитория."
  mv "$TEMP_DIR/source" "$TARGET_DIR"
}

ensure_docker() {
  if [ "$(uname -s)" = "Darwin" ] && [ -d "/Applications/Docker.app" ]; then
    export PATH="/Applications/Docker.app/Contents/Resources/bin:$HOME/.docker/bin:$PATH"
  fi

  if ! has_command docker; then
    [ "$INSTALL_DOCKER" = "1" ] || fail "Docker не найден. Установите Docker Desktop/Engine или задайте ALFA_FLOW_INSTALL_DOCKER=1."

    case "$(uname -s)" in
      Darwin)
        if has_command brew; then
          info "Устанавливаю Docker Desktop через Homebrew"
          brew install --cask docker-desktop
        else
          case "$(uname -m)" in
            arm64) docker_arch=arm64 ;;
            x86_64) docker_arch=amd64 ;;
            *) fail "Docker Desktop: неподдерживаемая архитектура $(uname -m)." ;;
          esac
          temp_dir
          info "Скачиваю официальный Docker Desktop для $docker_arch"
          download "https://desktop.docker.com/mac/main/$docker_arch/Docker.dmg" "$TEMP_DIR/Docker.dmg"
          mkdir "$TEMP_DIR/mount"
          hdiutil attach "$TEMP_DIR/Docker.dmg" -nobrowse -readonly -mountpoint "$TEMP_DIR/mount"
          DMG_MOUNT="$TEMP_DIR/mount"
          # --user performs privileged setup; Docker's first-run terms remain interactive.
          as_root "$DMG_MOUNT/Docker.app/Contents/MacOS/install" --user="$(id -un)"
          hdiutil detach "$DMG_MOUNT"
          DMG_MOUNT=""
        fi
        export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
        ;;
      Linux)
        has_command curl || fail "Для автоматической установки Docker нужен curl."
        temp_dir
        info "Устанавливаю Docker Engine и Compose из официального установщика Docker (dev/demo)"
        download https://get.docker.com "$TEMP_DIR/get-docker.sh"
        as_root sh "$TEMP_DIR/get-docker.sh"
        ;;
      *)
        fail "Операционная система не поддерживается этим скриптом: $(uname -s)"
        ;;
    esac
  fi

  has_command docker || fail "Docker CLI не найден после установки. Повторите запуск в новом терминале."
  if [ "$(uname -s)" = "Darwin" ]; then
    info "Запускаю Docker Desktop. При первом запуске подтвердите его условия в окне приложения."
    open -a Docker >/dev/null 2>&1 || true
  fi

  if ! docker info >/dev/null 2>&1 && [ "$(uname -s)" = "Linux" ]; then
    if [ -n "${DOCKER_HOST:-}${DOCKER_CONTEXT:-}" ] ||
       [ "$(docker context show 2>/dev/null || true)" != "default" ]; then
      fail "Недоступен выбранный Docker context. Запустите его; скрипт не переключает context автоматически."
    fi
    if [ "$(id -u)" -ne 0 ] && has_command sudo; then
      USE_SUDO=1
    fi
    if ! docker_exec info >/dev/null 2>&1; then
      as_root systemctl start docker >/dev/null 2>&1 ||
        as_root service docker start >/dev/null 2>&1 || true
    fi
  fi

  info "Жду готовности Docker Engine"
  elapsed=0
  while ! docker_exec info >/dev/null 2>&1; do
    [ "$elapsed" -lt "$WAIT_SECONDS" ] || fail "Docker Engine не запустился за ${WAIT_SECONDS} секунд."
    sleep 2
    elapsed=$((elapsed + 2))
  done

  docker_exec compose version >/dev/null 2>&1 || fail "Нужен Docker Compose v2: команда 'docker compose' недоступна."
  [ "$(docker_exec info --format '{{.OSType}}')" = "linux" ] ||
    fail "Нужен Docker Engine в режиме Linux containers."
  docker_exec compose up --help | grep -q -- '--wait-timeout' ||
    fail "Обновите Docker Compose: для запуска нужен up --wait --wait-timeout."
}

wait_for_app() {
  check_ready() {
    if has_command curl; then
      curl --fail --silent --show-error --max-time 10 "$APP_URL/api/v1/health/ready" |
        grep -q '"status"[[:space:]]*:[[:space:]]*"ready"'
    elif has_command wget; then
      wget -qO- -T 10 "$APP_URL/api/v1/health/ready" |
        grep -q '"status"[[:space:]]*:[[:space:]]*"ready"'
    else
      fail "Для проверки запуска нужен curl или wget."
    fi
  }

  info "Собираю контейнеры и запускаю ALFA FLOW"
  if ! docker_exec compose up --build -d --wait --wait-timeout "$WAIT_SECONDS"; then
    docker_exec compose ps || true
    docker_exec compose logs --tail=60 || true
    fail "Сборка или запуск не удались. Данные не удалены. Устраните ошибку и повторите команду."
  fi

  info "Жду readiness API"
  elapsed=0
  while ! check_ready; do
    [ "$elapsed" -lt "$WAIT_SECONDS" ] || {
      docker_exec compose ps
      fail "ALFA FLOW не вышел в ready за ${WAIT_SECONDS} секунд. Проверьте: docker compose logs."
    }
    sleep 2
    elapsed=$((elapsed + 2))
  done
}

open_browser() {
  [ "$OPEN_BROWSER" = "1" ] || return 0
  url="$APP_URL/demo"
  case "$(uname -s)" in
    Darwin) open "$url" >/dev/null 2>&1 || true ;;
    Linux)
      if has_command xdg-open; then
        xdg-open "$url" >/dev/null 2>&1 || true
      fi
      ;;
  esac
}

case "$WAIT_SECONDS" in
  ''|*[!0-9]*|0) fail "ALFA_FLOW_WAIT_SECONDS должен быть положительным целым числом." ;;
esac
case "$(uname -s)" in
  Darwin|Linux) ;;
  MINGW*|MSYS*) ;; # Also supports an existing Docker Desktop from Git Bash.
  *) fail "Поддерживаются macOS и Linux. На Windows используйте scripts/install.cmd." ;;
esac

ROOT="$(find_checkout 2>/dev/null || true)"
if [ -z "$ROOT" ]; then
  clone_checkout
  ROOT="$TARGET_DIR"
fi

cd "$ROOT"
if [ -f ".env.example" ] && [ ! -f ".env" ]; then
  (umask 077; cp ".env.example" ".env")
  info "Создан локальный .env из .env.example"
fi
ensure_docker
wait_for_app
open_browser

printf '\n'
info "Готово."
printf 'Кабинет:  %s/demo\n' "$APP_URL"
printf 'Swagger:  %s/docs/\n' "$APP_URL"
printf 'Стоп:     docker compose -f "%s/docker-compose.yml" stop\n' "$ROOT"
