# Cloud Functions — deployment

Two functions:

| Function | Purpose |
|---|---|
| `grantAdminClaim` | Sets the `admin: true` custom claim on your account, so security rules can match on your UID claim instead of your email. |
| `deleteCloudinaryAsset` | Permanently deletes an asset from Cloudinary. Deletion needs a request signed with the API secret, which must never reach the browser. |

## Before you start

**This requires the Blaze (pay-as-you-go) plan.** Cloud Functions cannot make
outbound requests to Cloudinary on the free Spark plan. Blaze has a free tier
that comfortably covers a site this size — you are unlikely to be billed — but
the plan must be upgraded for the deploy to succeed.

If you would rather not upgrade, say so and I will switch media deletion to
orphan-flagging instead: the Firestore record is marked deleted and hidden from
the library, and the Cloudinary asset is removed by hand from their dashboard.
Everything else in Stage 2 works without Cloud Functions.

## One-time setup

```sh
npm install -g firebase-tools
firebase login
cd functions && npm install && cd ..
```

## Store the Cloudinary credentials as secrets

Get these from the Cloudinary dashboard (Settings → API Keys). They are stored
in Google Secret Manager, never in the repo.

```sh
firebase functions:secrets:set CLOUDINARY_API_KEY
firebase functions:secrets:set CLOUDINARY_API_SECRET
```

The API **secret** is not the upload preset. The preset (`lpwbmgnq`) is public
by design and stays in the client. The secret must only ever live here.

## Deploy

```sh
firebase deploy --only functions
firebase deploy --only firestore:indexes
```

Deploy the indexes before the rules — the status-filtered queries need them, and
Firestore builds indexes asynchronously.

## Then, in this order

1. Open the admin panel → **Maintenance**
2. **Preview changes** — a dry run that writes nothing and reports what would change
3. **Run migration** — stamps `status`/`featured`/`publicId`, copies `categories`
   into `artCategories`, seeds the comic genres, backfills the media library
4. **Grant claim** — sets your admin custom claim, then sign out and back in
5. Only now publish the rules:

```sh
firebase deploy --only firestore:rules
```

Publishing the rules before step 3 will hide every existing artwork from the
public site, because public reads require `status == "published"` and older
documents have no status field. The migration is idempotent, so if you do it in
the wrong order, run the migration and the site returns.

## Verifying the rules actually bite

After publishing, in a private browser window (signed out), open devtools on the
live site and run:

```js
// Should FAIL with "Missing or insufficient permissions"
const { getFirestore, doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
await setDoc(doc(getFirestore(), "artworks", "hack-test"), { title: "should not work" });
```

If that write succeeds, the rules did not publish. Likes and comments should
still work in the same window — those are deliberately open to signed-in guests.
