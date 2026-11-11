#!/bin/bash
set -e
cd "$(dirname "$0")/.."
if [ -x "$PWD/.venv/bin/python" ]; then
  export INSPECTION_PYTHON="$PWD/.venv/bin/python"
elif [ -x "$PWD/.build-venv/bin/python" ]; then
  export INSPECTION_PYTHON="$PWD/.build-venv/bin/python"
else
  echo '먼저 docs/ACCELERATOR-SETUP.md의 Mac 설치를 완료하세요.'; exit 1
fi
export PORT=4174
node server.mjs
