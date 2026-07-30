#!/usr/bin/env bash
# Banpani one-shot deploy / update script. Run as root on a fresh Ubuntu droplet:
#   curl -fsSL https://raw.githubusercontent.com/parthajy/banpani/main/deploy/setup.sh | bash
# Re-running it later pulls the latest code and restarts (safe & idempotent).
set -euo pipefail

REPO="https://github.com/parthajy/banpani.git"
DIR="/opt/banpani"

echo "==> Installing Node 22, git, nginx"
export DEBIAN_FRONTEND=noninteractive
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
apt-get install -y git nginx >/dev/null

echo "==> Fetching code"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone "$REPO" "$DIR"; fi

echo "==> Environment (admin key generated once)"
if [ ! -f /etc/banpani.env ]; then
  KEY=$(head -c 24 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)
  cat > /etc/banpani.env <<EOF
PORT=8080
BANPANI_ADMIN_KEY=$KEY
BANPANI_DB=$DIR/server/banpani.db
EOF
  chmod 600 /etc/banpani.env
  echo "    (new admin key written to /etc/banpani.env)"
fi

echo "==> systemd service"
cp "$DIR/deploy/banpani.service" /etc/systemd/system/banpani.service
systemctl daemon-reload
systemctl enable banpani >/dev/null 2>&1 || true
systemctl restart banpani
sleep 2
node --experimental-sqlite "$DIR/server/report.js" >/dev/null 2>&1 || true   # seed the public 6h report page

echo "==> nginx reverse proxy"
cp "$DIR/deploy/nginx.conf" /etc/nginx/sites-available/banpani
ln -sf /etc/nginx/sites-available/banpani /etc/nginx/sites-enabled/banpani
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> cron: auto weather (3h), 6h report, hourly DB backup"
mkdir -p "$DIR/backups"
cat > /etc/cron.d/banpani <<EOF
0 */3 * * * root cd $DIR && /usr/bin/node --experimental-sqlite server/weather.js >/dev/null 2>&1
0 */6 * * * root cd $DIR && /usr/bin/node --experimental-sqlite server/report.js >/dev/null 2>&1
0 * * * * root cp $DIR/server/banpani.db $DIR/backups/banpani-\$(date +\%H).db 2>/dev/null
EOF

echo ""
echo "==> DONE. Status:"
systemctl is-active banpani && echo "    banpani: active"
echo "    Admin key:  $(grep ADMIN_KEY /etc/banpani.env | cut -d= -f2)"
echo "    Try:        curl -s localhost:8080/api/state | head -c 80"
echo "    Next:       point banpani.org DNS at this server, then run certbot for HTTPS."
