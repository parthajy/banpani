#!/usr/bin/env bash
# Auto-deploy: pull the latest from GitHub and restart only if something changed.
# Lets the daily "official data" routine (which pushes to the repo) go live on its own.
#   cron: 0 */6 * * *  bash /opt/banpani/deploy/autopull.sh
cd /opt/banpani || exit 0
before=$(git rev-parse HEAD 2>/dev/null)
git pull -q --ff-only origin main 2>/dev/null || exit 0
after=$(git rev-parse HEAD 2>/dev/null)
if [ "$before" != "$after" ]; then
  node --experimental-sqlite server/report.js >/dev/null 2>&1 || true
  systemctl restart banpani
  echo "$(date -u +%FT%TZ) deployed $after"
fi
