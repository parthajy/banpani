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
git checkout -f main -q 2>/dev/null || true          # self-heal if a prior photo run died on the orphan branch
rm -f "$REPO/photos.tar.gz.enc"                       # never let a stray photo snapshot land on main
git add -A
git -c user.name=banpani-backup -c user.email=backup@banpani.org \
  commit -m "backup $(date -u +%Y-%m-%dT%H:%MZ)" || echo "db: nothing to commit"
GIT_SSH_COMMAND="ssh -i /root/.ssh/banpani_backup -o IdentitiesOnly=yes" git push origin main
echo "db backup pushed."

# ---- Photos: single latest encrypted snapshot on an orphan 'photos' branch ----
# Photos only ever grow, so we keep just the LATEST snapshot (force-pushed to an orphan
# branch = no history bloat). Non-fatal: the DB backup above already succeeded, so a photo
# hiccup must never fail the job or leave the repo on the wrong branch.
UP="${BANPANI_UPLOADS:-/opt/banpani/uploads}"
if [ -d "$UP" ] && [ -n "$(ls -A "$UP" 2>/dev/null)" ]; then
(
  set -e
  PENC="$REPO/photos.tar.gz.enc"
  tar -czf - -C "$UP" . | openssl enc -aes-256-cbc -pbkdf2 -salt -out "$PENC" -pass pass:"$KEY"
  git checkout --orphan photos-snap -q
  git reset -q                                        # unstage everything (orphan keeps the worktree)
  git add -f "$PENC"                                  # commit ONLY the photo snapshot
  git -c user.name=banpani-backup -c user.email=backup@banpani.org commit -q -m "photos $(date -u +%Y-%m-%dT%H:%MZ)"
  GIT_SSH_COMMAND="ssh -i /root/.ssh/banpani_backup -o IdentitiesOnly=yes" git push -f origin photos-snap:photos
  git checkout -f main -q
  rm -f "$PENC"
  git branch -D photos-snap -q
  echo "photos backup pushed ($(du -sh "$UP" | cut -f1))."
) || { echo "photo backup skipped (non-fatal)"; git checkout -f main -q 2>/dev/null || true; rm -f "$REPO/photos.tar.gz.enc"; git branch -D photos-snap -q 2>/dev/null || true; }
fi
