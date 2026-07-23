

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInAnonymously,
  signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, addDoc, deleteDoc, updateDoc,
  collection, onSnapshot, query, orderBy, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBeZ1kT5TClG9_lMr9bs-WuF3T-6XHaKts",
  authDomain: "alafi-art-website.firebaseapp.com",
  projectId: "alafi-art-website",
  storageBucket: "alafi-art-website.firebasestorage.app",
  messagingSenderId: "526806992674",
  appId: "1:526806992674:web:58f445a4352c02b9a3877b"
};


export const ADMIN_EMAILS = [
  "jonathanalafi@gmail.com",
  "muhwezipetros@gmail.com"
];

.
const CLOUDINARY_CLOUD_NAME = "pmhpabd8";
const CLOUDINARY_UPLOAD_PRESET = "lpwbmgnq";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const uploadsConfigured =
  CLOUDINARY_CLOUD_NAME !== "PASTE_YOUR_CLOUD_NAME_HERE" &&
  CLOUDINARY_UPLOAD_PRESET !== "PASTE_YOUR_UNSIGNED_PRESET_HERE";

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


export function slugId(category, filenameOrTitle) {
  const base = (filenameOrTitle || "artwork")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return `${category}-${base || "artwork"}`;
}

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

export async function likeArtwork(artId, category, imageUrl) {
  const liked = getLikedIds();
  if (liked.includes(artId)) return false;

  const artRef = doc(db, "artworks", artId);
  const snap = await getDoc(artRef);
  if (snap.exists()) {
    await updateDoc(artRef, { likes: increment(1) });
  } else {
    await setDoc(artRef, {
      category, imageUrl: imageUrl || "", likes: 1, createdAt: serverTimestamp(), uploaded: false
    }, { merge: true });
  }
  rememberLiked(artId);
  return true;
}



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

export async function uploadArtwork(category, file, title, description) {
  const imageUrl = await uploadToCloudinary(file);
  const id = slugId(category, title || file.name);
  await setDoc(doc(db, "artworks", id), {
    category,
    title: title || file.name,
    description: description || "",
    imageUrl,
    likes: 0,
    createdAt: serverTimestamp() ,
  uploaded: true
}, { merge: true });

export function watchCategoryArtworks(category, callback) {
  const q = query(collection(db, "artworks"));
  return onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach(d => {
      const data = d.data();
      if (data.category === category && data.uploaded === true) items.push({ id: d.id, ...data });
    });
    items.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    callback(items);
  });
}
export async function deleteArtwork(artId) {
  // Removes from Firestore only — the Cloudinary file stays (unsigned
  // uploads can't be deleted from the browser, that's fine at this scale).
  await deleteDoc(doc(db, "artworks", artId));
}
