#!/usr/bin/env bash
# layerling Docker update with a check of the environment variables.
#
#   ./update.sh            check for the newest version and install it
#   ./update.sh --check    check only, change nothing
#   ./update.sh 1.107.0    a specific version
#   ./update.sh --force    override blocking checks (missing variable, downgrade)
#
# Exit codes: 0 ok/up to date · 1 error · 2 blocked by variable check · 3 health check failed, rolled back
#
# Works with bash 3.2 (macOS). Requires: docker (compose v2), curl. Optional: jq (release notes).

set -euo pipefail

IMAGE="ghcr.io/henmedia/layerling"
REPO_API="https://api.github.com/repos/henmedia/layerling/releases?per_page=50"
cd "$(dirname "$0")"

CHECK_ONLY=0; FORCE=0; TARGET=""
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --force) FORCE=1 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) TARGET="${arg#v}" ;;
  esac
done

log()  { printf '%s  %s\n' "$(date '+%F %T')" "$*"; }
die()  { log "ERROR: $*"; exit "${2:-1}"; }

[ -f .env ] || die ".env missing (see the guide, section 5.3)"
command -v docker >/dev/null || die "docker not found"
command -v curl >/dev/null   || die "curl not found"

# Prevent parallel runs
LOCK=".update.lock"
mkdir "$LOCK" 2>/dev/null || die "Update already running (remove $LOCK if stale)"
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

env_get() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
env_set() {
  local tmp; tmp="$(mktemp)"
  if grep -qE "^$1=" .env; then
    sed "s|^$1=.*|$1=$2|" .env > "$tmp"
  else
    cat .env > "$tmp"; echo "$1=$2" >> "$tmp"
  fi
  cat "$tmp" > .env; rm -f "$tmp"
}
image_version() {
  docker image inspect -f '{{ index .Config.Labels "org.opencontainers.image.version" }}' "$1" 2>/dev/null | sed 's/^v//'
}
# All LAYERLING_* names known to the built code of an image
image_vars() {
  docker run --rm --network none --entrypoint sh "$1" -c \
    "grep -rhoaE 'LAYERLING_[A-Z0-9_]+' /app/apps/web/.next 2>/dev/null; true" | sort -u
}
# All LAYERLING_* variables set by our own configuration
config_vars() { docker compose config 2>/dev/null | grep -oE 'LAYERLING_[A-Z0-9_]+' | sort -u; }
version_le() { [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -n1)" = "$1" ]; }

CUR="$(env_get LL_IMAGE_TAG)"
[ -n "$CUR" ] || die "LL_IMAGE_TAG in .env is empty"
PORT="$(env_get LL_PORT)"; PORT="${PORT:-3000}"
BIND="$(env_get LL_BIND)"; BIND="${BIND:-127.0.0.1}"; [ "$BIND" = "0.0.0.0" ] && BIND="127.0.0.1"

# --- Determine target version ----------------------------------------------
if [ -z "$TARGET" ]; then
  log "Checking for the newest version …"
  docker pull -q "$IMAGE:latest" >/dev/null
  TARGET="$(image_version "$IMAGE:latest")"
  [ -n "$TARGET" ] || die "Cannot read version from image label"
fi
log "Installed: $CUR · Target: $TARGET"

if [ "$TARGET" = "$CUR" ]; then log "Already up to date."; exit 0; fi
if version_le "$TARGET" "$CUR" && [ "$FORCE" -ne 1 ]; then
  die "Target $TARGET is older than $CUR (downgrade only with --force)"
fi

docker pull -q "$IMAGE:$TARGET" >/dev/null || die "Image $IMAGE:$TARGET not available"
docker image inspect "$IMAGE:$CUR" >/dev/null 2>&1 || docker pull -q "$IMAGE:$CUR" >/dev/null || true

# --- Variable check ---------------------------------------------------------
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"; rmdir "$LOCK" 2>/dev/null || true' EXIT
config_vars              > "$TMP/config"
image_vars "$IMAGE:$TARGET" > "$TMP/new"
image_vars "$IMAGE:$CUR"    > "$TMP/old" 2>/dev/null || : > "$TMP/old"

[ -s "$TMP/new" ] || die "No variables found in the new image – image layout changed? Check not possible." 2

MISSING="$(comm -23 "$TMP/config" "$TMP/new")"
ADDED="$(comm -13 "$TMP/old" "$TMP/new")"
REMOVED="$(comm -23 "$TMP/old" "$TMP/new" | comm -23 - "$TMP/config")"

BLOCK=0
if [ -n "$MISSING" ]; then
  log "BLOCKED: configured variables are unknown to the new image:"
  printf '    - %s\n' $MISSING
  BLOCK=1
fi
[ -n "$REMOVED" ] && { log "Removed in $TARGET (not configured):"; printf '    - %s\n' $REMOVED; }
[ -n "$ADDED" ]   && { log "New in $TARGET:"; printf '    + %s\n' $ADDED; }
[ -z "$MISSING$REMOVED$ADDED" ] && log "Variables unchanged."

# --- Scan release notes for configuration hints ----------------------------
if command -v jq >/dev/null; then
  NOTES="$(curl -fsS "$REPO_API" 2>/dev/null | jq -r --arg cur "$CUR" --arg tgt "$TARGET" '
      .[] | (.tag_name | ltrimstr("v")) as $v
      | select(($v|split(".")|map(tonumber? // 0)) >  ($cur|split(".")|map(tonumber? // 0))
           and ($v|split(".")|map(tonumber? // 0)) <= ($tgt|split(".")|map(tonumber? // 0)))
      | .body | split("\n")[] | select(test("LAYERLING_|[Dd]ocker|compose|environment|Umgebungsvariable|breaking|BREAKING|migrat"))
      | "    " + .' 2>/dev/null || true)"
  if [ -n "$NOTES" ]; then
    log "Configuration-related notes in the release notes $CUR → $TARGET:"
    printf '%s\n' "$NOTES" | cut -c1-200 | sort -u
  fi
else
  log "Note: jq missing, release notes not checked."
fi

if [ "$BLOCK" -eq 1 ] && [ "$FORCE" -ne 1 ]; then
  die "Update aborted. Adjust the configuration or override with --force." 2
fi
if [ "$CHECK_ONLY" -eq 1 ]; then log "Check only (--check), nothing changed."; exit 0; fi

# --- Backup of the projects folder before updating -------------------------
PROJ="$(env_get LL_PROJECTS_DIR)"
BDIR="$(env_get LL_BACKUP_DIR)"; BDIR="${BDIR:-./backups}"
KEEP="$(env_get LL_BACKUP_KEEP)"; KEEP="${KEEP:-14}"
if [ -n "$PROJ" ] && [ -d "$PROJ" ]; then
  mkdir -p "$BDIR"
  ARCHIVE="$BDIR/projects-$CUR-$(date +%Y%m%d-%H%M%S).tar.gz"
  tar -czf "$ARCHIVE" -C "$PROJ" . || die "Backup failed, update aborted"
  log "Backup: $ARCHIVE"
  ls -1t "$BDIR"/projects-*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do rm -f "$old"; done
else
  die "LL_PROJECTS_DIR ($PROJ) not found"
fi

# --- Switch over, health check, roll back if needed -------------------------
health() {
  local _
  for _ in $(seq 1 30); do
    if curl -fsS "http://$BIND:$PORT/api/shared-projects" 2>/dev/null | grep -q '"enabled":true'; then
      [ "$(image_version "$(docker inspect -f '{{.Config.Image}}' layerling)")" = "$1" ] && return 0
    fi
    sleep 2
  done
  return 1
}

env_set LL_IMAGE_TAG "$TARGET"
log "Starting $TARGET …"
docker compose up -d --remove-orphans >/dev/null

if health "$TARGET"; then
  log "OK: layerling $TARGET is running, shared folder active."
  exit 0
fi

log "Health check failed – rolling back to $CUR"
docker compose logs --tail 30 layerling || true
env_set LL_IMAGE_TAG "$CUR"
docker compose up -d >/dev/null
health "$CUR" && log "Rollback successful." || log "WARNING: $CUR does not start cleanly either, check manually."
exit 3
