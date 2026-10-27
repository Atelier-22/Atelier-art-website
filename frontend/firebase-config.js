import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInAnonymously,
  signInWithEmailAndPassword, sendPasswordResetEmail, signOut, setPersistence,
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
  if (!user) return false;
  const signedInEmail = (user.email || "").trim().toLowerCase();
  return ADMIN_EMAILS.some(email => email.trim().toLowerCase() === signedInEmail);
}

export function watchAuth(callback) {
  let active = true;
  let unsubscribe = null;
  // Wait until the chosen persistence store has been initialized before
  // observing auth; otherwise the first null state can briefly win a refresh.
  authReady.then(() => {
    if (active) unsubscribe = onAuthStateChanged(auth, callback);
  });
  return () => {
    active = false;
    unsubscribe?.();
  };
}

export async function ownerLogin(email, password) {
  await authReady;
  return signInWithEmailAndPassword(auth, (email || "").trim().toLowerCase(), password);
}

export async function ownerPasswordReset(email) {
  await authReady;
  return sendPasswordResetEmail(auth, (email || "").trim().toLowerCase());
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
