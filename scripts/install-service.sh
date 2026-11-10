#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICE_FILE="/etc/systemd/system/clip-defect-demo.service"
RUN_USER="${SUDO_USER:-$USER}"

sudo tee "$SERVICE_FILE" >/dev/null <<EOF
[Unit]
Description=CLIP Defect Inspection Demo
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$APP_DIR
ExecStart=$(command -v node) $APP_DIR/server.mjs
Restart=on-failure
RestartSec=3
Environment=PORT=4173

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now clip-defect-demo.service
sudo systemctl status clip-defect-demo.service --no-pager
