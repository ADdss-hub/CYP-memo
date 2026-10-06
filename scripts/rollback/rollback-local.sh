#!/usr/bin/env bash
# 委托 snapshot SSOT
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec bash "$ROOT/scripts/snapshot/rollback-local.sh" "$@"
