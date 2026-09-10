# Alafi Art Work

The gallery site at <https://alafi-art-work.twendelink.com/>.

```
frontend/   the site: every page, stylesheet, script and image, served as-is
backend/    FastAPI server: serves frontend/ and offers the Firestore reads
            and writes as an HTTP API under /api (see backend/README.md)
functions/  the two Firebase Cloud Functions (admin claim, Cloudinary delete)
firestore.rules, firestore.indexes.json, firebase.json, .firebaserc
            the Firebase project config; Hosting is pointed at frontend/
```

Every page is plain HTML with its content in the markup. `frontend/index.html`
loads GSAP and `assets/js/hero-animation.js` for the homepage hero's arrival;
without them the hero simply shows.

To run the whole thing locally, see `backend/README.md`. To serve the site
alone, any static server pointed at `frontend/` will do
(`python -m http.server` inside it, for instance).
