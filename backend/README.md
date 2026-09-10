# Alafi Art Work — backend

A small FastAPI server with two jobs:

1. **Serve `frontend/` as the static site it always was.** Same URLs
   (`/`, `/gallery.html`, `/paintings.html`, …), same files, same cache
   headers the Firebase Hosting config used to set, and a real `404` status
   carrying `404.html` for anything unknown. Nothing about how a page is
   addressed has changed, so every URL Google already holds keeps resolving.

2. **Offer the Firestore reads and writes the browser does today as an HTTP
   API under `/api`**, authorised by the visitor's Firebase ID token and
   executed with the Admin SDK. The pages do not depend on it yet — they still
   talk to Firebase directly for their live listeners (`onSnapshot`), which a
   request/response API cannot replace one-for-one. This is the layer that
   lets that move happen one call at a time, without another restructure.

## Run it locally

```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt        # Windows
# .venv/bin/pip install -r requirements.txt          # macOS / Linux
cp .env.example .env                                 # then fill it in (see below)
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8765
```

Then open <http://127.0.0.1:8765/>. The site serves with or without
credentials; without them every `/api` route answers `503` with the reason,
and `/api/health` reports what is and is not configured.

Interactive API docs: <http://127.0.0.1:8765/api/docs>.

## Configuration (`backend/.env`)

| Variable | What it is |
| --- | --- |
| `FIREBASE_PROJECT_ID` | `alafi-art-website` |
| `FIREBASE_SERVICE_ACCOUNT_FILE` | Path to the service-account key JSON (Firebase console → Project settings → Service accounts → *Generate new private key*). Relative paths resolve against `backend/`. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | The same JSON on one line, for hosts that only offer environment variables. Either this or the file. |
| `ADMIN_EMAILS` | Comma-separated owner addresses. Must match the lists in `firestore.rules` and `frontend/firebase-config.js`. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_UPLOAD_PRESET` | As in `frontend/assets/js/data.js`. |
| `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Needed only for deleting assets and signing uploads (Cloudinary console → Settings → API keys). |
| `FRONTEND_DIR` | Where the static site lives. Defaults to `../frontend`. |
| `CORS_ORIGINS` | Origins allowed to call `/api` from a browser. |

The key grants full access to the Firebase project. `.gitignore` already
excludes `backend/.env` and `backend/serviceAccount*.json`; keep it that way.

## Authorisation

Send the visitor's Firebase ID token as a bearer token:

```
Authorization: Bearer <idToken>
```

In the site's own code that is `(await auth.currentUser.getIdToken())` with
`auth` imported from `firebase-config.js`. Anonymous sessions — which every
visitor has — count as signed in, exactly as in `firestore.rules`. Owner
routes require the `admin` custom claim, or an email on `ADMIN_EMAILS` while
the claim propagates: the same two checks the rules make.

The Admin SDK bypasses `firestore.rules`, so this server enforces the same
constraints itself (published-only reads, like = exactly +1, comment length
and name length, owner-only writes).

## Routes

Public, no token:

| Method | Path | Mirrors |
| --- | --- | --- |
| GET | `/api/health` | — |
| GET | `/api/config` | `siteConfig/published` (raw; merge over defaults in the browser) |
| GET | `/api/categories/{art\|comics}` | `fetchCategories` |
| GET | `/api/artworks?category=<slug>` | `watchGalleryPieces` / `watchArtworks` (published only) |
| GET | `/api/artworks/{id}` | one published artwork |
| GET | `/api/comics`, `/api/comics/{id}` | `fetchComics` (published only) |
| GET | `/api/{artworks\|comics}/{id}/likes` | `watchLikes` |
| GET | `/api/{artworks\|comics}/{id}/comments` | `watchComments` |

Any signed-in token (anonymous included):

| Method | Path | Mirrors |
| --- | --- | --- |
| GET | `/api/me` | who the token says you are |
| POST | `/api/{artworks\|comics}/{id}/like` | `toggleLike` (transactional +1, seeds the counter) |
| POST | `/api/{artworks\|comics}/{id}/comments` | `addComment` (`{name, text}`) |
| POST | `/api/admin/claim` | `grantAdminClaim` Cloud Function (owner emails only) |

Owner token:

| Method | Path | Mirrors |
| --- | --- | --- |
| GET / PUT | `/api/admin/config/draft` | `fetchConfig("draft")` / `saveDraft` |
| POST | `/api/admin/config/publish`, `/api/admin/config/discard` | `publishDraft` / `discardDraft` |
| POST | `/api/categories/{kind}` | `createCategory` |
| PATCH / DELETE | `/api/categories/{kind}/{id}` | `updateCategory` / `deleteCategory` |
| PUT | `/api/admin/categories/{kind}/order` | `reorderCategories` (`{ids}`) |
| GET | `/api/admin/artworks` | `watchAllArtworks` (drafts included) |
| POST | `/api/artworks` | `createArtwork` (file already on Cloudinary) |
| PATCH / DELETE | `/api/artworks/{id}` | `updateArtwork`, hide/show, replace, rename / `deleteArtwork` |
| PUT | `/api/admin/artworks/order` | `reorderArchivePieces` |
| GET | `/api/admin/comics` | admin comics list |
| POST | `/api/comics` | `createComic` |
| PATCH / DELETE | `/api/comics/{id}` | `updateComic` / `deleteComic` |
| PUT | `/api/admin/comics/order` | `reorderComics` |
| GET | `/api/admin/comments` | `watchAllComments` |
| DELETE | `/api/{artworks\|comics}/{id}/comments/{commentId}` | `deleteComment` |
| GET | `/api/admin/changelog` | `watchChangeLog` |
| GET / POST | `/api/admin/media` | `watchMedia` / `recordMedia` |
| POST | `/api/admin/media/sign` | signed direct-to-Cloudinary upload parameters |
| DELETE | `/api/admin/media/{id}` | `deleteMedia` — the `deleteCloudinaryAsset` Cloud Function, server-side |

Every owner write that the admin panel logs is logged here too, into the
same `changeLog` collection, with `"via": "api"` so the two are tellable
apart.

## Static serving details

- `Cache-Control: no-cache` on HTML, CSS, JS, txt and xml (always
  revalidated, so a browser can never hold an old `core.css` next to a new
  `admin.css`); `public, max-age=604800` on images, icons and fonts. This is
  what `firebase.json` specified.
- Conditional requests (`ETag` → `304`), `HEAD` and `Range` all work.
- Unknown paths get `404.html` with a real `404` status. No redirects, no
  fallback to `index.html`. Dotfiles are never served.
- `/api/*` that does not exist is a JSON `404`, not the site's page.

## Deployment — what changes now that there is a backend

**Where the site actually runs.** `alafi-art-work.twendelink.com` resolves to
`198.177.124.159` (`server1.twendelink.com`), where Caddy — in the shared
Docker Compose stack under `/opt/twende/` — serves the files from a bind
mount. Namecheap is only the registrar/DNS for `twendelink.com`. **Nothing
changes on the Namecheap side**: the domain, the subdomain record and the DNS
setup stay exactly as they are.

**Namecheap shared hosting could not run this.** If the site were on
Namecheap's shared hosting (cPanel, static HTML), a long-running Python
process would not be an option there. It is not: the VPS runs Docker, and a
Python container is the natural addition to the stack that is already there.

Two ways to wire it in, on the VPS:

### Option A (recommended): Caddy keeps serving the files, proxies `/api`

The static site stays exactly as it is served today — same headers, same
404 handling — and only `/api/*` goes to the Python container. If the
container is ever down, the site is still up and only the API is affected.

1. Clone the repo on the server (never upload from a laptop; see the deploy
   notes in the repo history) — e.g. to `/opt/twende/alafi-art-work-src`.
2. Put the service-account key at
   `/opt/twende/alafi-art-work-src/backend/serviceAccount.json` and a filled
   `.env` beside it with `FIREBASE_SERVICE_ACCOUNT_FILE=/app/serviceAccount.json`.
3. Add the container to `/opt/twende/docker-compose.yml`:

   ```yaml
   alafi-api:
     build:
       context: /opt/twende/alafi-art-work-src
       dockerfile: backend/Dockerfile
     env_file: /opt/twende/alafi-art-work-src/backend/.env
     volumes:
       - /opt/twende/alafi-art-work-src/backend/serviceAccount.json:/app/serviceAccount.json:ro
     expose: ["8000"]
     restart: unless-stopped
   ```

   then `docker compose up -d alafi-api` — this starts the new container
   without touching Caddy or the other sites.

4. In the `alafi-art-work.twendelink.com` block of `/opt/twende/Caddyfile`,
   route the API before the existing file server:

   ```caddyfile
   handle /api/* {
       reverse_proxy alafi-api:8000
   }
   ```

   Write the file **in place** (`cat new > Caddyfile`, never `sed -i` or a
   rename — the file is a bind mount and Docker follows the inode), then
   `docker exec twende-caddy-1 caddy reload --config /etc/caddy/Caddyfile`
   for a zero-downtime apply.

5. Deploy the static files as before, except that the served directory now
   receives the **contents of `frontend/`** rather than the repo root minus
   its config files: `rsync -a --delete <clone>/frontend/ /opt/twende/alafi-art-work/`
   (write into the mounted directory; never replace it).

### Option B: proxy everything to the Python app

Replace the block's `file_server` with `reverse_proxy alafi-api:8000` and
let this app serve the pages too (it bakes `frontend/` into the image). One
moving part fewer to keep in step, but the site is then only up while the
container is. Redeploying is `docker compose build alafi-api && docker compose up -d alafi-api`.

### Firebase Hosting

`firebase.json` now points `hosting.public` at `frontend/`, so
`firebase deploy --only hosting` still works as a static-only deploy. It
cannot host the Python API.
