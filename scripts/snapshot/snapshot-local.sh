#!/usr/bin/env bash
# CYP-memo 本地数据快照（与 snapshot-local.ps1 同口径）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DATA="${CYP_SNAPSHOT_DATA_DIR:-$ROOT/packages/server/data}"
if [[ ! -d "$DATA" ]]; then
  echo "DATA_DIR missing: $DATA" >&2
  exit 1
fi
ts="$(date +%Y%m%d_%H%M%S)"
SNAPROOT="${CYP_SNAPSHOT_ROOT:-$ROOT/backups/snapshots}"
dest="$SNAPROOT/snap-$ts"
mkdir -p "$dest"
cp -a "$DATA/." "$dest/"
commit="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
printf '{\n  "ts": "%s",\n  "source": "%s",\n  "dest": "%s",\n  "commit": "%s"\n}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$DATA" "$dest" "$commit" > "$dest/SNAPSHOT.json"
node "$ROOT/scripts/_internal/write-dir-manifest.mjs" "$dest"
printf '%s\n' "$dest" > "$SNAPROOT/LATEST.txt"
echo "OK   snapshot -> $dest"
