const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

initializeApp();

const CLOUDINARY_CLOUD_NAME = "pmhpabd8";
const CLOUDINARY_API_KEY = defineSecret("CLOUDINARY_API_KEY");
const CLOUDINARY_API_SECRET = defineSecret("CLOUDINARY_API_SECRET");

/**
 * The only accounts allowed to become admin. Bootstrapping is gated on the
 * signed email claim, which cannot be forged: Firebase will not issue a token
 * for an address unless the caller authenticated as it.
 */
const ADMIN_EMAILS = [
  "jonathanalafi@gmail.com",
  "muhwezipetros@gmail.com"
];

function requireAdmin(request) {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in first.");
  if (auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Admin privileges required.");
  }
  return auth;
}

/**
 * Grants the admin custom claim to the calling account.
 *
 * Safe to expose: it only ever elevates an account that has already proven it
 * controls one of the allow-listed addresses, and it can only elevate the
 * caller — never a third party.
 */
exports.grantAdminClaim = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in first.");

  const email = auth.token.email;
  if (!email || !ADMIN_EMAILS.includes(email)) {
    throw new HttpsError("permission-denied", "This account is not an owner account.");
  }

  await getAuth().setCustomUserClaims(auth.uid, { admin: true });
  return {
    uid: auth.uid,
    email,
    admin: true,
    note: "Sign out and back in (or refresh the ID token) for the claim to take effect."
  };
});

/**
 * Permanently removes an asset from Cloudinary.
 *
 * Deletion requires a request signed with the API secret, which must never
 * reach the browser — so it happens here instead. The signature is
 * sha1(sorted params + secret), per Cloudinary's spec.
 */
exports.deleteCloudinaryAsset = onCall(
  { secrets: [CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET] },
  async (request) => {
    requireAdmin(request);

    const publicId = (request.data?.publicId || "").toString().trim();
    if (!publicId) {
      throw new HttpsError("invalid-argument", "publicId is required.");
    }

    const resourceType = ["image", "video", "raw"].includes(request.data?.resourceType)
      ? request.data.resourceType
      : "image";

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto
      .createHash("sha1")
      .update(`public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET.value()}`)
      .digest("hex");

    const body = new URLSearchParams({
      public_id: publicId,
      timestamp: String(timestamp),
      api_key: CLOUDINARY_API_KEY.value(),
      signature
    });

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/destroy`,
      { method: "POST", body }
    );

    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new HttpsError("internal", `Cloudinary returned ${res.status}: ${payload.error?.message || "unknown error"}`);
    }

    // "not found" means the asset is already gone — treat that as success so a
    // retry after a partial failure can still clear the Firestore record.
    if (payload.result !== "ok" && payload.result !== "not found") {
      throw new HttpsError("internal", `Cloudinary refused the delete: ${payload.result}`);
    }

    return { publicId, result: payload.result };
  }
);
