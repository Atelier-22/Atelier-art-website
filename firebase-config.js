import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInAnonymously,
  signInWithEmailAndPassword, signOut, setPersistence,
  indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, getDocs, collection
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

const app = initializeApp(firebaseConfig);
export const getApp = () => app;
export const auth = getAuth(app);
export const db = getFirestore(app);

/**
 * Ask for the most durable storage this browser will actually give us.
 *
 * Signing in was surviving a refresh on desktop and not on a phone, and this
 * is why: the default store is IndexedDB, which mobile Safari declines in
 * private browsing and prunes for sites it considers idle. When it is refused
 * the SDK falls back to keeping the session in memory, so the next page load
 * starts signed out with nothing to say why.
 *
 * Trying each store in turn means the session lands in the best one available
 * rather than the first one attempted, and `persistenceMode` records which so
 * the login screen can warn when the answer is "none of them".
 */
export let persistenceMode = "pending";

export const authReady = (async () => {
  const stores = [
    ["indexeddb", indexedDBLocalPersistence],
    ["local", browserLocalPersistence],
    ["session", browserSessionPersistence]
  ];
  for (const [name, store] of stores) {
    try {
      await setPersistence(auth, store);
      persistenceMode = name;
      return name;
    } catch (err) {
      console.warn(`Auth persistence "${name}" unavailable:`, err?.code || err);
    }
  }
  persistenceMode = "memory";
  return "memory";
})();

let guestPromise = null;

export function ensureGuestAuth() {
  if (guestPromise) return guestPromise;
  guestPromise = authReady.then(() => new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) { unsub(); resolve(user); return; }
      signInAnonymously(auth).catch((err) => {
        unsub();
        console.error("Anonymous sign-in failed:", err);
        reject(err);
      });
    });
  }));
  return guestPromise;
}

export function isOwner(user) {
  return !!user && ADMIN_EMAILS.includes(user.email);
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Phone keyboards capitalise the first letter of a field and often leave a
 * trailing space, and both were being sent to Firebase verbatim. Normalising
 * here rather than at the input means it holds however the address arrives —
 * typed, autofilled, or pasted.
 */
export async function ownerLogin(email, password) {
  await authReady;
  return signInWithEmailAndPassword(auth, (email || "").trim().toLowerCase(), password);
}

export function ownerLogout() {
  return signOut(auth);
}

export async function fetchUploadedArtworks() {
  const snap = await getDocs(collection(db, "artworks"));
  const byCategory = {};
  snap.forEach((d) => {
    const data = d.data();
    if (data.uploaded !== true || !data.imageUrl) return;
    (byCategory[data.category] ||= []).push({ id: d.id, ...data });
  });
  Object.values(byCategory).forEach(list =>
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
  );
  return byCategory;
}
