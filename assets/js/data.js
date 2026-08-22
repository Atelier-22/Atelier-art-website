import { db, auth } from "../../firebase-config.js";
import { DEFAULT_ART_CATEGORIES, DEFAULT_COMIC_CATEGORIES } from "./site-data.js";
import {
  doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, updateDoc, writeBatch,
  collection, collectionGroup, onSnapshot, query, orderBy, where,
  serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export const CLOUDINARY_CLOUD_NAME = "pmhpabd8";
export const CLOUDINARY_UPLOAD_PRESET = "lpwbmgnq";

export function slugify(value, fallback = "item") {
  const slug = (value || "")
    .toString()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return slug || fallback;
}

export function artworkId(categorySlug, titleOrFilename) {
  return `${categorySlug}-${slugify(titleOrFilename, "artwork")}`;
}

/* ------------------------------------------------------------------ */
/*  Cloudinary upload with real progress                               */
/* ------------------------------------------------------------------ */

export function uploadImage(file, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    });

    xhr.addEventListener("load", () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Cloudinary rejected "${file.name}" (${xhr.status})`));
        return;
      }
      try {
        const data = JSON.parse(xhr.responseText);
        resolve(data.secure_url);
      } catch {
        reject(new Error("Cloudinary returned an unreadable response."));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error during upload.")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled.")));
    xhr.send(form);
  });
}

/* ------------------------------------------------------------------ */
/*  Categories — art and comics share the same shape                   */
/* ------------------------------------------------------------------ */

function categoryPath(kind) {
  return kind === "comics" ? "comicCategories" : "categories";
}

function defaultsFor(kind) {
  return kind === "comics" ? DEFAULT_COMIC_CATEGORIES : DEFAULT_ART_CATEGORIES;
}

function normaliseCategory(id, data, index) {
  return {
    id,
    slug: data.slug || id,
    name: data.name || data.label || id,
    tagline: data.tagline || "",
    blurb: data.blurb || "",
    order: typeof data.order === "number" ? data.order : index,
    page: data.page || null
  };
}

export function watchCategories(kind, callback, onError) {
  const ref = collection(db, categoryPath(kind));
  return onSnapshot(ref, (snap) => {
    if (snap.empty) {
      callback(defaultsFor(kind).map((c, i) => normaliseCategory(c.slug, c, i)), { seeded: false });
      return;
    }
    const items = snap.docs
      .map((d, i) => normaliseCategory(d.id, d.data(), i))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    callback(items, { seeded: true });
  }, (err) => {
    console.warn(`watchCategories(${kind}) failed, falling back to defaults.`, err);
    callback(defaultsFor(kind).map((c, i) => normaliseCategory(c.slug, c, i)), { seeded: false });
    onError?.(err);
  });
}

export async function fetchCategories(kind) {
  try {
    const snap = await getDocs(collection(db, categoryPath(kind)));
    if (snap.empty) return defaultsFor(kind).map((c, i) => normaliseCategory(c.slug, c, i));
    return snap.docs
      .map((d, i) => normaliseCategory(d.id, d.data(), i))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  } catch (err) {
    console.warn(`fetchCategories(${kind}) failed, falling back to defaults.`, err);
    return defaultsFor(kind).map((c, i) => normaliseCategory(c.slug, c, i));
  }
}

export async function seedDefaultCategories(kind) {
  const ref = collection(db, categoryPath(kind));
  const snap = await getDocs(ref);
  if (!snap.empty) return false;
  const batch = writeBatch(db);
  defaultsFor(kind).forEach((c, i) => {
    batch.set(doc(db, categoryPath(kind), c.slug), {
      slug: c.slug,
      name: c.label || c.name,
      tagline: c.tagline || "",
      blurb: c.blurb || "",
      page: c.page || null,
      order: i,
      createdAt: serverTimestamp()
    });
  });
  await batch.commit();
  return true;
}

export async function createCategory(kind, name) {
  const slug = slugify(name, "category");
  const ref = doc(db, categoryPath(kind), slug);
  if ((await getDoc(ref)).exists()) {
    throw new Error(`A category with the slug "${slug}" already exists.`);
  }
  const existing = await getDocs(collection(db, categoryPath(kind)));
  await setDoc(ref, {
    slug,
    name: name.trim(),
    tagline: "",
    blurb: "",
    order: existing.size,
    createdAt: serverTimestamp()
  });
  return slug;
}

export async function updateCategory(kind, id, patch) {
  await updateDoc(doc(db, categoryPath(kind), id), patch);
}

export async function reorderCategories(kind, orderedIds) {
  const batch = writeBatch(db);
  orderedIds.forEach((id, i) => batch.update(doc(db, categoryPath(kind), id), { order: i }));
  await batch.commit();
}

export async function deleteCategory(kind, id) {
  await deleteDoc(doc(db, categoryPath(kind), id));
}

/* ------------------------------------------------------------------ */
/*  Artworks                                                           */
/* ------------------------------------------------------------------ */

function normaliseArtwork(id, data) {
  return {
    id,
    category: data.category || "general",
    title: data.title || "Untitled",
    description: data.description || "",
    imageUrl: data.imageUrl || "",
    likes: data.likes || 0,
    uploaded: data.uploaded === true,
    createdAt: data.createdAt?.seconds || 0
  };
}

export function watchArtworks(categorySlug, callback, onError) {
  const ref = categorySlug
    ? query(collection(db, "artworks"), where("category", "==", categorySlug))
    : collection(db, "artworks");

  return onSnapshot(ref, (snap) => {
    const items = snap.docs
      .map(d => normaliseArtwork(d.id, d.data()))
      .filter(a => a.uploaded && a.imageUrl)
      .sort((a, b) => b.createdAt - a.createdAt);
    callback(items);
  }, (err) => {
    console.error("watchArtworks error:", err);
    onError?.(err);
  });
}

export function watchAllArtworks(callback, onError) {
  return onSnapshot(collection(db, "artworks"), (snap) => {
    callback(snap.docs.map(d => normaliseArtwork(d.id, d.data())));
  }, (err) => {
    console.error("watchAllArtworks error:", err);
    onError?.(err);
  });
}

export async function createArtwork({ categorySlug, file, title, description, imageUrl, onProgress }) {
  const url = imageUrl || await uploadImage(file, onProgress);
  const name = (title || file?.name || "Untitled").trim();
  const id = artworkId(categorySlug, name);
  await setDoc(doc(db, "artworks", id), {
    category: categorySlug,
    title: name,
    description: description || "",
    imageUrl: url,
    likes: 0,
    createdAt: serverTimestamp(),
    uploaded: true
  }, { merge: true });
  return { id, imageUrl: url };
}

export async function updateArtwork(id, patch) {
  await updateDoc(doc(db, "artworks", id), patch);
}

export async function deleteArtwork(id) {
  await deleteDoc(doc(db, "artworks", id));
}

/* ------------------------------------------------------------------ */
/*  Comics — a comic is a story: cover + ordered pages                 */
/* ------------------------------------------------------------------ */

function normaliseComic(id, data) {
  return {
    id,
    title: data.title || "Untitled Story",
    categorySlug: data.categorySlug || "uncategorised",
    description: data.description || "",
    coverUrl: data.coverUrl || data.pages?.[0] || "",
    pages: Array.isArray(data.pages) ? data.pages.filter(Boolean) : [],
    likes: data.likes || 0,
    order: typeof data.order === "number" ? data.order : 0,
    createdAt: data.createdAt?.seconds || 0
  };
}

export function watchComics(callback, onError) {
  return onSnapshot(collection(db, "comics"), (snap) => {
    const items = snap.docs
      .map(d => normaliseComic(d.id, d.data()))
      .sort((a, b) => a.order - b.order || b.createdAt - a.createdAt);
    callback(items);
  }, (err) => {
    console.error("watchComics error:", err);
    onError?.(err);
  });
}

export async function fetchComics() {
  try {
    const snap = await getDocs(collection(db, "comics"));
    return snap.docs
      .map(d => normaliseComic(d.id, d.data()))
      .sort((a, b) => a.order - b.order || b.createdAt - a.createdAt);
  } catch (err) {
    console.warn("fetchComics failed.", err);
    return [];
  }
}

export async function createComic({ title, categorySlug, description, coverUrl, pages }) {
  const id = slugify(title, "story");
  const ref = doc(db, "comics", id);
  const existing = await getDoc(ref);
  if (existing.exists()) throw new Error(`A story called "${title}" already exists.`);

  const all = await getDocs(collection(db, "comics"));
  await setDoc(ref, {
    title: title.trim(),
    categorySlug,
    description: description || "",
    coverUrl: coverUrl || pages[0] || "",
    pages,
    likes: 0,
    order: all.size,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return id;
}

export async function updateComic(id, patch) {
  await updateDoc(doc(db, "comics", id), { ...patch, updatedAt: serverTimestamp() });
}

export async function deleteComic(id) {
  await deleteDoc(doc(db, "comics", id));
}

export async function reorderComics(orderedIds) {
  const batch = writeBatch(db);
  orderedIds.forEach((id, i) => batch.update(doc(db, "comics", id), { order: i }));
  await batch.commit();
}

/* ------------------------------------------------------------------ */
/*  Likes — shared by artworks and comics                              */
/* ------------------------------------------------------------------ */

const LIKED_KEY = "alafi_liked_ids";

export function getLikedIds() {
  try { return JSON.parse(localStorage.getItem(LIKED_KEY) || "[]"); }
  catch { return []; }
}

export function hasLiked(id) {
  return getLikedIds().includes(id);
}

function rememberLiked(id) {
  const liked = getLikedIds();
  if (liked.includes(id)) return;
  liked.push(id);
  try { localStorage.setItem(LIKED_KEY, JSON.stringify(liked)); } catch { /* private mode */ }
}

export async function toggleLike(collectionName, id, seedData) {
  if (hasLiked(id)) return false;
  const ref = doc(db, collectionName, id);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, { likes: increment(1) });
  } else {
    await setDoc(ref, { ...seedData, likes: 1, createdAt: serverTimestamp() }, { merge: true });
  }
  rememberLiked(id);
  return true;
}

export function watchLikes(collectionName, id, callback, onError) {
  return onSnapshot(doc(db, collectionName, id), (snap) => {
    callback(snap.exists() ? (snap.data().likes || 0) : 0);
  }, (err) => {
    console.error("watchLikes error for", id, err);
    onError?.(err);
  });
}

/* ------------------------------------------------------------------ */
/*  Comments                                                           */
/* ------------------------------------------------------------------ */

export function watchComments(collectionName, id, callback, onError) {
  const q = query(collection(db, collectionName, id, "comments"), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, (err) => {
    console.error("watchComments error for", id, err);
    onError?.(err);
  });
}

export async function addComment(collectionName, id, name, text) {
  const clean = (s, max) => (s || "").toString().trim().slice(0, max);
  const body = clean(text, 300);
  if (!body) return;
  await addDoc(collection(db, collectionName, id, "comments"), {
    name: clean(name, 40) || "Guest",
    text: body,
    uid: auth.currentUser?.uid || null,
    createdAt: serverTimestamp()
  });
}

export async function deleteComment(collectionName, id, commentId) {
  await deleteDoc(doc(db, collectionName, id, "comments", commentId));
}

export function watchAllComments(callback, onError) {
  return onSnapshot(collectionGroup(db, "comments"), (snap) => {
    const items = snap.docs.map((d) => {
      const parent = d.ref.parent.parent;
      return {
        id: d.id,
        parentId: parent ? parent.id : "unknown",
        parentCollection: parent ? parent.parent.id : "artworks",
        name: d.data().name || "Guest",
        text: d.data().text || "",
        createdAt: d.data().createdAt?.toMillis?.() || 0
      };
    });
    items.sort((a, b) => b.createdAt - a.createdAt);
    callback(items);
  }, (err) => {
    console.error("watchAllComments error:", err);
    onError?.(err);
  });
}
