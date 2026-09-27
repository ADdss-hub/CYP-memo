#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
PURGE=0
[[ "${1:-}" == "--purge" ]] && PURGE=1
rm_if() { [[ -e "$1" ]] && echo "Removing: $1" && rm -rf "$1" || echo "Skip: $1"; }
# admin 包已退役，不再清理其路径
for t in packages/app/dist packages/server/dist packages/desktop/dist packages/shared/dist tmp temp .tmp; do
  rm_if "$t"
done
if [[ "$PURGE" -eq 0 ]]; then
  echo "Done (default). Use --purge for deeper clean (DB preserved)."
  exit 0
fi
echo "WARNING: --purge cleans logs/local-all* and some caches; DB not deleted."
read -r -p "Type YES to continue: " c
[[ "$c" == "YES" ]] || { echo Aborted; exit 1; }
rm_if logs/local-all.out.log
rm_if logs/local-all.err.log
rm_if logs/local-all.pid
rm_if packages/app/node_modules/.cache
rm_if packages/server/node_modules/.cache
rm_if packages/desktop/node_modules/.cache
echo "Purge clean done"
