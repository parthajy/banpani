#!/usr/bin/env bash
# Auto-deploy: pull the latest from GitHub and restart only if something changed AND the
# front-end still loads clean. The smoke test (test/smoke.mjs) runs the browser JS in a
# stubbed DOM and fails on load-time errors - so a bad commit is rolled back instead of
# taking the live site down.
#   cron: 0 */6 * * *  bash /opt/banpani/deploy/autopull.sh
cd /opt/banpani || exit 0
before=$(git rev-parse HEAD 2>/dev/null)
git pull -q --ff-only origin main 2>/dev/null || exit 0
after=$(git rev-parse HEAD 2>/dev/null)
[ "$before" = "$after" ] && exit 0

# Gate: never restart into a front-end that throws on load.
if ! node test/smoke.mjs; then
  echo "$(date -u +%FT%TZ) SMOKE TEST FAILED for $after - rolling back to $before, not restarting"
  git reset --hard "$before" -q
  exit 1
fi

node --experimental-sqlite server/report.js >/dev/null 2>&1 || true
systemctl restart banpani
echo "$(date -u +%FT%TZ) deployed $after"
