#!/usr/bin/env bash
# CYP-memo 从最近快照回滚（与 rollback-local.ps1 同口径）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SNAPROOT="${CYP_SNAPSHOT_ROOT:-$ROOT/backups/snapshots}"
LATEST="$SNAPROOT/LATEST.txt"
src="${1:-}"
if [[ -z "$src" && -f "$LATEST" ]]; then
  src="$(tr -d '\r\n' < "$LATEST")"
fi
if [[ -z "$src" || ! -d "$src" ]]; then
  echo "No snapshot. Run scripts/snapshot/snapshot-local.sh first, or pass a snap path." >&2
  exit 1
fi
node "$ROOT/scripts/verify/verify-dir-manifest.mjs" "$src" || exit 1
DATA="${CYP_SNAPSHOT_DATA_DIR:-$ROOT/packages/server/data}"
mkdir -p "$DATA"
safety="$SNAPROOT/pre-rollback-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$safety"
cp -a "$DATA/." "$safety/" 2>/dev/null || true
find "$DATA" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
find "$src" -mindepth 1 -maxdepth 1 ! -name 'SNAPSHOT.json' ! -name 'MANIFEST.sha256' -exec cp -a {} "$DATA/" \;
echo "OK   rollback from $src"
echo "Safety copy: $safety"
echo "NOTE: restart server to reload sql.js memory from disk if already running."
