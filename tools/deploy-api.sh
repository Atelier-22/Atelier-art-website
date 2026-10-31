#!/usr/bin/env bash
set -euo pipefail

KEY="${DEPLOY_KEY:-$HOME/.ssh/alafi_deploy}"
HOST="${DEPLOY_HOST:-root@198.177.124.159}"
BRANCH="${DEPLOY_BRANCH:-main}"
REPO="https://github.com/Atelier-22/Atelier-art-website.git"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

ENV_FILE="$(mktemp)"
trap 'rm -f "$ENV_FILE"' EXIT
python - "$HERE/backend" > "$ENV_FILE" <<'PY'
import json, sys, pathlib
root = pathlib.Path(sys.argv[1])
env = dict(l.split("=", 1) for l in (root / ".env").read_text().splitlines() if "=" in l and not l.startswith("#"))
sa = json.loads((root / env.get("FIREBASE_SERVICE_ACCOUNT_FILE", "serviceAccount.json")).read_text())
out = {
    "FIREBASE_PROJECT_ID": env["FIREBASE_PROJECT_ID"],
    "FIREBASE_SERVICE_ACCOUNT_JSON": json.dumps(sa, separators=(",", ":")),
    "ADMIN_EMAILS": env["ADMIN_EMAILS"],
    "CLOUDINARY_CLOUD_NAME": env["CLOUDINARY_CLOUD_NAME"],
    "CLOUDINARY_UPLOAD_PRESET": env["CLOUDINARY_UPLOAD_PRESET"],
    "CLOUDINARY_API_KEY": env["CLOUDINARY_API_KEY"],
    "CLOUDINARY_API_SECRET": env["CLOUDINARY_API_SECRET"],
    "PUBLIC_ORIGIN": "https://alafi-art-work.twendelink.com",
    "CORS_ORIGINS": "https://alafi-art-work.twendelink.com",
}
print("\n".join(f"{k}={v}" for k, v in out.items()))
PY

ssh -i "$KEY" -o BatchMode=yes "$HOST" 'umask 077; cat > /root/alafi-api.env; chmod 600 /root/alafi-api.env; ls -l /root/alafi-api.env' < "$ENV_FILE"

ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=20 "$HOST" "BRANCH='$BRANCH' REPO='$REPO' bash -s" <<'REMOTE'
set -euo pipefail
cd /opt/twende
STAMP=$(date +%Y%m%d-%H%M%S)
SRC=/root/alafi-api-src
rm -rf "$SRC"
git clone -q --depth 1 --branch "$BRANCH" "$REPO" "$SRC"
SHA=$(git -C "$SRC" rev-parse --short HEAD)
docker build -q -t "alafi-api:$SHA" -f "$SRC/backend/Dockerfile" "$SRC" >/dev/null
docker run --rm "alafi-api:$SHA" sh -c 'test ! -e /app/.env && ! ls /app/*.json >/dev/null 2>&1 && echo "image holds no secrets"'

if docker ps -a --format '{{.Names}}' | grep -qx alafi-api; then docker rm -f alafi-api >/dev/null; fi
docker run -d --name alafi-api --restart unless-stopped --network twende_default \
  --env-file /root/alafi-api.env --memory 256m "alafi-api:$SHA" >/dev/null
for i in $(seq 1 30); do
  if docker exec alafi-api python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health').status==200 else 1)" 2>/dev/null; then break; fi
  sleep 1
done
docker exec alafi-api python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/api/health').read().decode())"

BACKUP="Caddyfile.backup-$STAMP"
cp -a Caddyfile "$BACKUP"
python3 - Caddyfile > Caddyfile.candidate <<'PY'
import sys
text = open(sys.argv[1]).read()
marker = "alafi-art-work.twendelink.com {\n"
block = "\thandle /api/* {\n\t\treverse_proxy alafi-api:8000\n\t}\n\thandle /sitemap.xml {\n\t\treverse_proxy alafi-api:8000\n\t}\n\n"
if "reverse_proxy alafi-api:8000" not in text:
    head, tail = text.split(marker, 1)
    lines = tail.split("\n", 3)
    text = head + marker + "\n".join(lines[:3]) + "\n\n" + block + lines[3]
sys.stdout.write(text)
PY
restore() {
  echo "restoring $BACKUP"
  cat "$BACKUP" > Caddyfile
  docker exec twende-caddy-1 caddy reload --config /etc/caddy/Caddyfile
}
if ! docker exec -i twende-caddy-1 caddy validate --adapter caddyfile --config /dev/stdin < Caddyfile.candidate; then
  echo "validate failed; Caddyfile untouched"; rm -f Caddyfile.candidate; exit 1
fi
cat Caddyfile.candidate > Caddyfile
rm -f Caddyfile.candidate
if ! docker exec twende-caddy-1 caddy reload --config /etc/caddy/Caddyfile; then restore; exit 1; fi
sleep 2
CODE=$(curl -s -o /dev/null -w '%{http_code}' https://alafi-art-work.twendelink.com/api/health || true)
if [ "$CODE" != "200" ]; then echo "api through caddy returned $CODE"; restore; exit 1; fi
echo "api live via caddy ($SHA), Caddyfile backup $BACKUP"
for site in twendelink.com hms.twendelink.com school.twendelink.com law.twendelink.com; do
  echo "$site $(curl -s -o /dev/null -w '%{http_code}' https://$site/)"
done
docker ps --format '{{.Names}}\t{{.Status}}'
REMOTE
