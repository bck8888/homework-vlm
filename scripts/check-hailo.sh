#!/usr/bin/env bash
set -euo pipefail
if ! command -v hailortcli >/dev/null 2>&1; then
  echo "HailoRT가 설치되지 않았거나 hailortcli가 PATH에 없습니다."
  exit 1
fi
hailortcli fw-control identify
if command -v hailo-clip >/dev/null 2>&1; then
  echo "hailo-clip: $(command -v hailo-clip)"
else
  echo "Hailo 장치는 확인했지만 hailo-clip 명령은 없습니다. hailo-apps 설치를 확인하세요."
fi
