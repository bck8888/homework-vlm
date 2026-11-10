#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js가 없습니다. Raspberry Pi OS에서 sudo apt update && sudo apt install -y nodejs npm 을 실행하세요."
  exit 1
fi

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(`.`)[0])')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20 이상이 필요합니다. 현재 버전: $(node --version)"
  exit 1
fi

mkdir -p "$APP_DIR/data"
touch "$APP_DIR/data/inspection-history.jsonl"
chmod +x "$APP_DIR/scripts/start.sh" "$APP_DIR/scripts/install-service.sh"

if [ ! -f "$APP_DIR/dist/index.html" ]; then
  cd "$APP_DIR"
  npm ci
  npm run generate:targets
  npm run build
fi

echo "설치 완료"
echo "실행: $APP_DIR/scripts/start.sh"
echo "브라우저: http://localhost:4173"
