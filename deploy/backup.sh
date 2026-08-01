#!/usr/bin/env bash
# Off-site, ENCRYPTED daily backup of the SQLite DB to a private GitHub repo.
# The DB holds victim contact numbers, so it is AES-256 encrypted before it ever
# leaves the droplet. 7 rolling files (one per weekday) keep the backup repo bounded.
#   cron: 0 2 * * *  BANPANI_BACKUP=1 bash /opt/banpani/deploy/backup.sh
set -euo pipefail
set -a; source /etc/banpani.env; set +a
DB="${BANPANI_DB:-/opt/banpani/server/banpani.db}"
REPO=/opt/banpani-backups
KEY="${BANPANI_BACKUP_KEY:?BANPANI_BACKUP_KEY not set}"
TMP=/tmp/banpani-backup.db

sqlite3 "$DB" ".backup '$TMP'"                 # consistent snapshot (WAL-safe)
gzip -f "$TMP"                                  # -> $TMP.gz
openssl enc -aes-256-cbc -pbkdf2 -salt -in "$TMP.gz" \
  -out "$REPO/banpani-$(date +%u).db.gz.enc" -pass pass:"$KEY"
rm -f "$TMP.gz"

cd "$REPO"
git add -A
git -c user.name=banpani-backup -c user.email=backup@banpani.org \
  commit -m "backup $(date -u +%Y-%m-%dT%H:%MZ)" || { echo "nothing to commit"; exit 0; }
GIT_SSH_COMMAND="ssh -i /root/.ssh/banpani_backup -o IdentitiesOnly=yes" git push origin main
echo "backup pushed."
