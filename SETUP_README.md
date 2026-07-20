# Alafi Art Work — Firebase Setup Guide

Your 13 original pages are untouched in layout/design. What changed:

- **Removed:** the old visitor-facing "Upload Artwork" bar on all 7 gallery
  pages (paintings, sketches, digital, sculptures, comics, portraits,
  graphics) — it only ever saved to *that one visitor's* browser and
  conflicted with "visitors can't upload."
- **Added:** `firebase-config.js` and `gallery-social.js` (shared by every
  gallery page) for real likes, comments, anti-theft, and owner-only
  downloads.
- **Rewired:** `admin.html` to log in with real Firebase Auth (email +
  password) instead of a password sitting in plain JavaScript, and to
  upload/delete real files in Firebase Storage + Firestore.
- **New:** `firestore.rules` and `storage.rules` — paste these into the
  Firebase Console.
- **Fixed:** `about.html` and `contact.html` had stray ` ```html ` /
  ` ``` ` text saved inside them (leftover markdown fences) that would
  have broken the pages — removed.
- **Fixed:** `graphics.html` was missing its `<link rel="stylesheet"
  href="style.css">` tag — added.

## 1. Create the Firebase project

1. Go to https://console.firebase.google.com → **Add project**.
2. Once created, click the **Web** icon (`</>`) to register a web app.
   Firebase will show you a `firebaseConfig` object — copy it.

## 2. Paste your config

Open **`firebase-config.js`** and replace the placeholder object near the
top:

```js
const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY_HERE",
  authDomain: "PASTE_YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "PASTE_YOUR_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID"
};
```

with the real values from step 1.

## 3. Set the owner's email

Still in `firebase-config.js`:

```js
export const ADMIN_EMAIL = "PASTE_OWNER_EMAIL_HERE";
```

Change this to your friend's real email address — this is the *only*
account that will ever see the upload dashboard, the delete buttons, and
the download buttons.

## 4. Turn on Auth, Firestore, and Storage

In the Firebase Console:

- **Authentication** → Sign-in method → enable **Email/Password** and
  **Anonymous**.
- **Authentication** → Users → **Add user** → enter the owner's email +
  a password. This is what your friend will type into `admin.html`.
- **Firestore Database** → Create database → start in production mode.
- **Storage** → Get started → start in production mode.

## 5. Paste the security rules

- Firestore Database → **Rules** tab → paste the contents of
  `firestore.rules` → replace both `"PASTE_OWNER_EMAIL_HERE"` with the
  same email from step 3 → **Publish**.
- Storage → **Rules** tab → paste the contents of `storage.rules` →
  replace `"PASTE_OWNER_EMAIL_HERE"` → **Publish**.

## 6. Host the files somewhere real (important)

Because `firebase-config.js` and `gallery-social.js` are loaded as
JavaScript **modules**, they will not run if you just double-click
`index.html` and open it as a `file://` link. You need to serve it over
`http://` or `https://`. Easiest free option: **Firebase Hosting**
(`firebase init hosting` → `firebase deploy`), or any static host
(GitHub Pages, Netlify, Vercel). For quick local testing, running
`python3 -m http.server` inside the folder and visiting
`http://localhost:8000` also works.

## How it works day-to-day

- **Visitors**: browse freely, tap a heart to like (remembered per
  browser, one like each), type a name + comment on any artwork — no
  account needed. Right-click/drag-save is blocked on every image.
- **You (owner)**: log in at `admin.html` with the email/password from
  step 4. You'll see the upload dashboard, per-category stats, and a
  manage grid with delete buttons. On every gallery page, once you're
  logged in (in that same browser), a working **Download** button
  appears under each artwork — visitors never see it.
