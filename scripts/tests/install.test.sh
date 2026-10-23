#!/usr/bin/env sh
# Contract tests: no real Docker, sudo, package installation, or external requests.
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/alfa-flow-test.XXXXXXXX")"
trap 'rm -rf -- "$TEST_ROOT"' 0
mkdir -p "$TEST_ROOT/bin" "$TEST_ROOT/bootstrap" "$TEST_ROOT/archive/alfa-main/backend" "$TEST_ROOT/archive/alfa-main/web"
cp "$ROOT/scripts/install.sh" "$TEST_ROOT/bootstrap/install.sh"
printf 'name: test\n' > "$TEST_ROOT/archive/alfa-main/docker-compose.yml"
printf 'module test\n' > "$TEST_ROOT/archive/alfa-main/backend/go.mod"
printf '{"name":"alfa-flow-web"}\n' > "$TEST_ROOT/archive/alfa-main/web/package.json"
printf 'POSTGRES_PASSWORD=example\n' > "$TEST_ROOT/archive/alfa-main/.env.example"
tar -czf "$TEST_ROOT/source.tar.gz" -C "$TEST_ROOT/archive" alfa-main
export TEST_ROOT
cat > "$TEST_ROOT/bin/docker" <<'SH'
#!/bin/sh
printf '%s\n' "$*" >> "$TEST_ROOT/calls"
case "$*" in
  'info --format '*) printf 'linux\n' ;;
  'compose up --help') printf '%s\n' '--wait --wait-timeout' ;;
  'compose up --build '*) [ "${FAIL_BUILD:-0}" = 0 ] || exit 17 ;;
esac
SH
cat > "$TEST_ROOT/bin/curl" <<'SH'
#!/bin/sh
output=""
previous=""
for arg in "$@"; do
  if [ "$previous" = "--output" ] || [ "$previous" = "-o" ]; then output="$arg"; fi
  previous="$arg"
done
if [ -n "$output" ]; then
  [ "${GH_TOKEN:-}" = "test-token-not-real" ] || exit 22
  cp "$TEST_ROOT/source.tar.gz" "$output"
else
  printf '{"status":"ready"}\n'
fi
SH
cat > "$TEST_ROOT/bin/uname" <<'SH'
#!/bin/sh
case "$1" in
  -s) printf '%s\n' "${TEST_OS:-Linux}" ;;
  -m) printf 'arm64\n' ;;
esac
SH
cat > "$TEST_ROOT/bin/open" <<'SH'
#!/bin/sh
exit 0
SH
chmod +x "$TEST_ROOT/bin/"*
export PATH="$TEST_ROOT/bin:$PATH"
export ALFA_FLOW_DIR="$TEST_ROOT/installation with spaces"
export ALFA_FLOW_OPEN_BROWSER=0 ALFA_FLOW_INSTALL_DOCKER=0 ALFA_FLOW_WAIT_SECONDS=2
export GH_TOKEN=test-token-not-real
cd "$TEST_ROOT/bootstrap"
sh ./install.sh
[ -f "$ALFA_FLOW_DIR/.env" ]
printf 'POSTGRES_PASSWORD=preserved\n' > "$ALFA_FLOW_DIR/.env"
TEST_OS=Darwin sh ./install.sh
grep -q 'POSTGRES_PASSWORD=preserved' "$ALFA_FLOW_DIR/.env"
if FAIL_BUILD=1 sh ./install.sh > "$TEST_ROOT/failure.log" 2>&1; then
  printf 'FAIL: build error reported as success\n' >&2
  exit 1
fi
grep -q -- '--wait --wait-timeout' "$TEST_ROOT/calls"
if grep -E 'down|volume rm|system prune' "$TEST_ROOT/calls"; then
  printf 'FAIL: destructive Docker command\n' >&2
  exit 1
fi
[ ! -e "$ALFA_FLOW_DIR/.git" ]
export ALFA_FLOW_DIR="$TEST_ROOT/unrelated"
mkdir "$ALFA_FLOW_DIR"
printf 'keep\n' > "$ALFA_FLOW_DIR/keep.txt"
if sh ./install.sh > "$TEST_ROOT/unrelated.log" 2>&1; then
  printf 'FAIL: unrelated directory was accepted\n' >&2
  exit 1
fi
grep -q keep "$ALFA_FLOW_DIR/keep.txt"
printf 'PASS: Linux/macOS control flow, private archive, paths with spaces, .env preservation, build failure, no deletion\n'
