#!/usr/bin/env bash
set -euo pipefail

KEY="${DEPLOY_KEY:-$HOME/.ssh/alafi_deploy}"
HOST="${DEPLOY_HOST:-root@198.177.124.159}"
BRANCH="${DEPLOY_BRANCH:-main}"
REPO="https://github.com/Atelier-22/Atelier-art-website.git"

LOCAL_HEAD=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)

ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=20 "$HOST" "BRANCH='$BRANCH' REPO='$REPO' bash -s" <<'REMOTE'
set -euo pipefail
cd /opt/twende
LIVE=alafi-art-work
TMP=alafi-art-work-new
KEEP=3

rm -rf "$TMP"
git clone -q --depth 1 --branch "$BRANCH" "$REPO" "$TMP"
SHA=$(git -C "$TMP" rev-parse --short HEAD)
SUBJECT=$(git -C "$TMP" log -1 --format=%s)
test -f "$TMP/frontend/index.html"

STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP="$LIVE.backup-$STAMP"
cp -a "$LIVE" "$BACKUP"

rsync -a --delete "$TMP/frontend/" "$LIVE/"
rm -rf "$TMP"

ls -d "$LIVE".backup-* | sort | head -n -"$KEEP" | xargs -r rm -rf

docker exec twende-caddy-1 test -f /var/www/$LIVE/index.html

echo "deployed $SHA  $SUBJECT"
echo "backup   $BACKUP"
echo "kept     $(ls -d "$LIVE".backup-* | sort | tr '\n' ' ')"
REMOTE

echo "local    $LOCAL_HEAD"
