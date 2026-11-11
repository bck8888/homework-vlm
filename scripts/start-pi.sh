#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export INSPECTION_PYTHON="$PWD/.venv/bin/python"
export PORT=4174
if [[ ! -x "$INSPECTION_PYTHON" ]]; then
  echo 'First complete docs/ACCELERATOR-SETUP.md.'; exit 1
fi
node server.mjs
