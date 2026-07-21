/ ============================================================
// firebase-config.js
// Shared Firebase setup for the Alafi Art Work Website.
// Every gallery page (paintings.html, sketches.html, etc.) and
// admin.html import functions from this ONE file — so you only
// ever need to edit your Firebase config in this one place.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInAnonymously,
  signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, addDoc, deleteDoc, updateDoc,
  collection, onSnapshot, query, orderBy, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ============================================================
// 1. PASTE YOUR FIREBASE PROJECT CONFIG HERE
//    (Firebase Console -> Project Settings -> General ->
//     "Your apps" -> Web app -> SDK setup and configuration)
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyBeZ1kT5TClG9_lMr9bs-WuF3T-6XHaKts",
  authDomain: "alafi-art-website.firebaseapp.com",
  projectId: "alafi-art-website",
  storageBucket: "alafi-art-website.firebasestorage.app",
  messagingSenderId: "526806992674",
  appId: "1:526806992674:web:58f445a4352c02b9a3877b"
};

// ============================================================
// 2. SET THE OWNER'S LOGIN EMAIL HERE
//    Create this exact user under Firebase Console ->
//    Authentication -> Users -> Add user (Email/Password).
//    This is the ONLY account that will ever see the upload
//    dashboard and the manage/delete grid.
// ============================================================
export const ADMIN_EMAILS = [
  "jonathanalafi@gmail.com",
  "muhwezipetros@gmail.com"
]; 

// ============================================================
// 3. IMAGE HOSTING — Cloudinary (free, no card required)
//    We do NOT use Firebase Storage anymore (it needs the paid
//    Blaze plan). Instead uploaded images go to Cloudinary's free
//    tier, which allows secure "unsigned" uploads straight from
//    the browser without ever exposing a secret key.
//
//    Setup (5 minutes, free, no card):
//    1. Create a free account at https://cloudinary.com
//    2. On your Cloudinary Dashboard, copy your "Cloud name".
//    3. Go to Settings (gear icon) -> Upload -> scroll to
//       "Upload presets" -> "Add upload preset".
//         - Set "Signing Mode" to "Unsigned".
//         - (Optional) set Folder to "alafi-art".
//         - Save, then copy the preset name it gives you.
//    4. Paste both values below.
// ============================================================
const CLOUDINARY_CLOUD_NAME = "pmhpabd8";
const CLOUDINARY_UPLOAD_PRESET = "lpwbmgnq";

// ------------------------------------------------------------

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// True once the two Cloudinary values above have actually been filled in.
export const uploadsConfigured =
  CLOUDINARY_CLOUD_NAME !== "PASTE_YOUR_CLOUD_NAME_HERE" &&
  CLOUDINARY_UPLOAD_PRESET !== "PASTE_YOUR_UNSIGNED_PRESET_HERE";

// Uploads a single image file to Cloudinary and returns its public URL.
// This call is safe to run in the browser: an "unsigned" preset can
// only ever ADD an image, it cannot read, list, or delete anything in
// the account, so there's no secret being exposed.
async function uploadToCloudinary(file) {
  if (!uploadsConfigured) {
    throw new Error("Image hosting isn't set up yet. Paste your Cloudinary cloud name and upload preset into firebase-config.js.");
  }
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: "POST",
    body: form
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error("Cloudinary upload failed: " + errText);
  }
  const data = await res.json();
  return data.secure_url;
}

/* =================== AUTH =================== */

// Silently signs every visitor in anonymously (no form, no prompt)
// so they can leave a comment without ever "registering."
export function ensureGuestAuth() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) { unsub(); resolve(user); return; }
      signInAnonymously(auth).catch(err => console.error("Anonymous sign-in failed:", err));
    });
  });
}
export function isOwner(user) {
  return !!user && ADMIN_EMAILS.includes(user.email);
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export function ownerLogin(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function ownerLogout() {
  return signOut(auth);
}

/* =================== STABLE ARTWORK IDS =================== */

// Gives every artwork — whether it's one of the original hardcoded
// demo images or something the owner uploads later — a stable,
// predictable Firestore document id, so likes/comments work the
// same way for both.
export function slugId(category, filenameOrTitle) {
  const base = (filenameOrTitle || "artwork")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return `${category}-${base || "artwork"}`;
}

/* =================== LIKES =================== */

const LIKED_KEY = "alafi_liked_ids";

export function getLikedIds() {
  try { return JSON.parse(localStorage.getItem(LIKED_KEY) || "[]"); }
  catch { return []; }
}

function rememberLiked(id) {
  const liked = getLikedIds();
  if (!liked.includes(id)) {
    liked.push(id);
    localStorage.setItem(LIKED_KEY, JSON.stringify(liked));
  }
}

export function watchLikeCount(artId, callback, onError) {
  const artRef = doc(db, "artworks", artId);
  return onSnapshot(artRef, (snap) => {
    callback(snap.exists() ? (snap.data().likes || 0) : 0);
  }, (err) => {
    console.error("watchLikeCount error for", artId, err);
    if (onError) onError(err);
  });
}

// Returns true if the like went through, false if this browser
// already liked this artwork before.
export async function likeArtwork(artId, category, imageUrl) {
  const liked = getLikedIds();
  if (liked.includes(artId)) return false;

  const artRef = doc(db, "artworks", artId);
  const snap = await getDoc(artRef);
  if (snap.exists()) {
    await updateDoc(artRef, { likes: increment(1) });
  } else {
    // First-ever like on a static demo image: create its doc now.
    await setDoc(artRef, {
      category, imageUrl: imageUrl || "", likes: 1, createdAt: serverTimestamp()
    }, { merge: true });
  }
  rememberLiked(artId);
  return true;
}

/* =================== COMMENTS =================== */

export function watchComments(artId, callback, onError) {
  const q = query(collection(db, "artworks", artId, "comments"), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, (err) => {
    console.error("watchComments error for", artId, err);
    if (onError) onError(err);
  });
}

export async function addComment(artId, name, text, uid) {
  const clean = (s, max) => (s || "").toString().trim().slice(0, max);
  const cleanName = clean(name, 40) || "Guest";
  const cleanText = clean(text, 300);
  if (!cleanText) return;
  await addDoc(collection(db, "artworks", artId, "comments"), {
    name: cleanName,
    text: cleanText,
    uid: uid || null,
    createdAt: serverTimestamp()
  });
}

/* =================== OWNER-ONLY: UPLOAD / MANAGE =================== */
// Used only by admin.html. firestore.rules independently enforces that
// only the signed-in owner can write these artwork docs — this file
// does not do any of that enforcement itself. Image uploads go to
// Cloudinary (see the "IMAGE HOSTING" section above), which isn't
// Firebase-rule-governed but only accepts unsigned adds, never reads
// or deletes.

export async function uploadArtwork(category, file, title, description) {
  const imageUrl = await uploadToCloudinary(file);
  const id = slugId(category, title || file.name);
  await setDoc(doc(db, "artworks", id), {
    category,
    title: title || file.name,
    description: description || "",
    imageUrl,
    likes: 0,
    createdAt: serverTimestamp()
  }, { merge: true });
  return { id, imageUrl };
}

export function watchCategoryArtworks(category, callback) {
  const q = query(collection(db, "artworks"));
  return onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach(d => { if (d.data().category === category) items.push({ id: d.id, ...d.data() }); });
    items.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    callback(items);
  });
}

export async function deleteArtwork(artId) {
  // Note: this removes the artwork from the site (Firestore) but does
  // not delete the underlying file from Cloudinary — unsigned uploads
  // can't be deleted from the browser for security reasons. That's
  // fine for a small personal gallery; the orphaned file just sits
  // unused in your free Cloudinary storage.
  await deleteDoc(doc(db, "artworks", artId));
}

}
