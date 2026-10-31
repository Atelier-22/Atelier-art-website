# Alafi Art Work — backend

A small FastAPI server. The pages read and write Firestore directly with live
`onSnapshot` listeners; this server exists for the things a browser must not
do on its own.

| Route | Who | What |
| --- | --- | --- |
| `GET /api/health` | anyone | Whether Firebase Admin and the Cloudinary key are configured. |
| `GET /sitemap.xml` | anyone | Built on every request from the live `artCategories` collection plus the fixed pages. |
| `GET /api/me` | signed in | The caller's uid, email and admin status. |
| `POST /api/admin/claim` | owner email | Sets the `admin: true` custom claim on the caller. |
| `POST /api/admin/assets/destroy` | admin | Deletes one Cloudinary asset with a signed call, then removes its `media` records. Body: `{"publicId": "...", "resourceType": "image" \| "video" \| "raw"}`. |

The Cloudinary API secret and the Firebase service account only ever live on
the server. The dashboard calls `/api/admin/assets/destroy` with the signed-in
admin's Firebase ID token as `Authorization: Bearer <token>`.

## How deletes and replacements work

Every dashboard delete goes **Cloudinary first, then Firestore**
(`releaseAsset` in `frontend/assets/js/data.js`):

1. Count every other place the same Cloudinary `public_id` is referenced —
   artworks, stories, collection covers and the whole live settings document.
2. If nothing else uses it, call `/api/admin/assets/destroy`. If that call
   fails, the Firestore record is left untouched and the admin sees the error.
3. Only then delete the document or clear the field.

A file that is still used somewhere else (for example an artwork image that is
also a collection cover) is kept, and the dashboard says so.

Replacing works the other way round: upload the new file (Cloudinary gives it a
fresh random `public_id`), save the new URL, then release the old file.

## Run it locally

```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt
cp .env.example .env
.venv/Scripts/python -m uvicorn app.main:app --port 8765
```

Port 8000 is often taken on the development machine; use 8765. The server also
serves `frontend/`, so <http://127.0.0.1:8765/> is the whole site, and `/api`
is same-origin.

## Configuration

| Variable | What it is |
| --- | --- |
| `FIREBASE_PROJECT_ID` | `alafi-art-website` |
| `FIREBASE_SERVICE_ACCOUNT_FILE` / `FIREBASE_SERVICE_ACCOUNT_JSON` | The service-account key, as a path or as one line of JSON. |
| `ADMIN_EMAILS` | Must match `firestore.rules` and `frontend/firebase-config.js`. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_UPLOAD_PRESET` | As in `frontend/assets/js/data.js`. |
| `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Needed for deletes. |
| `PUBLIC_ORIGIN` | The site's public address, used in the sitemap. |
| `CORS_ORIGINS` | Origins allowed to call `/api` from a browser. |
| `FRONTEND_DIR` | Where the static site lives. |

`backend/.env` and `backend/serviceAccount*.json` are git-ignored and excluded
from the Docker image by `.dockerignore`.

## Cache headers

Every static file and the sitemap are sent with `Cache-Control: no-cache`;
`/api` responses are `no-store`. Nothing on the site is served from a stale
copy.

## Production

Caddy on the VPS keeps serving `frontend/` from `/opt/twende/alafi-art-work`
and proxies `/api/*` and `/sitemap.xml` to a standalone `alafi-api` container
on the `twende_default` network. `tools/deploy-api.sh`:

- writes the secrets to `/root/alafi-api.env` (mode 600) — never into the
  image or the repository;
- clones `main`, builds `alafi-api:<sha>` from `backend/Dockerfile`, checks
  the image holds no secrets, and replaces only the `alafi-api` container;
- backs up the Caddyfile, runs `caddy validate` on the new version, reloads,
  and restores the backup automatically if the reload or the health check
  fails;
- prints the status of the other four sites afterwards.

The static files are deployed separately with `tools/deploy.sh`.

## Firebase Functions

`functions/` holds an older callable implementation of the same delete. It is
not deployed — the project is on the Spark plan, where Cloud Functions are
unavailable — and nothing calls it any more.
