// ============================================================
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
import {
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

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
  appId: "1:526806992674:web:58f445a4352c02b9a3877b"D"
};

// ============================================================
// 2. SET THE OWNER'S LOGIN EMAIL HERE
//    Create this exact user under Firebase Console ->
//    Authentication -> Users -> Add user (Email/Password).
//    This is the ONLY account that will ever see the upload
//    dashboard, the manage/delete grid, or download buttons.
// ============================================================
export const ADMIN_EMAILS = [
  "jonathanalafi@gmail.com",
  "muhwezipetros@gmail.com"
]; 

// ------------------------------------------------------------

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Storage requires the Blaze (pay-as-you-go) plan. If it isn't set up
// yet, we don't want that to break Auth/Firestore (login, likes,
// comments) for the rest of the site — so we set it up defensively and
// only complain when someone actually tries to upload/delete a file.
let storage = null;
try {
  storage = getStorage(app);
} catch (e) {
  console.warn("Firebase Storage not available yet (needs the Blaze plan). Uploads are disabled until it's set up.", e.message);
}
export { storage };

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

export function watchLikeCount(artId, callback) {
  const artRef = doc(db, "artworks", artId);
  return onSnapshot(artRef, (snap) => {
    callback(snap.exists() ? (snap.data().likes || 0) : 0);
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

export function watchComments(artId, callback) {
  const q = query(collection(db, "artworks", artId, "comments"), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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
// Used only by admin.html. Firestore/Storage security rules (see
// firestore.rules and storage.rules) independently enforce that only
// the signed-in owner can actually write here — this file does not
// do any of that enforcement itself.

export async function uploadArtwork(category, file, title, description) {
  if (!storage) {
    throw new Error("Uploads are disabled until Firebase Storage is turned on (requires the Blaze plan). Everything else on the site still works.");
  }
  const id = slugId(category, title || file.name);
  const path = `artworks/${category}/${Date.now()}-${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  const imageUrl = await getDownloadURL(storageRef);
  await setDoc(doc(db, "artworks", id), {
    category,
    title: title || file.name,
    description: description || "",
    imageUrl,
    storagePath: path,
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

export async function deleteArtwork(artId, storagePath) {
  if (storagePath && storage) {
    try { await deleteObject(ref(storage, storagePath)); }
    catch (e) { console.warn("Storage file already gone or missing:", e.message); }
  }
  await deleteDoc(doc(db, "artworks", artId));
}
