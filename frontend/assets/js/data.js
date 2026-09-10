import { db, auth, getApp } from "../../firebase-config.js?v=20260823a";
import { DEFAULT_ART_CATEGORIES, DEFAULT_COMIC_CATEGORIES } from "./site-data.js?v=20260823a";
import { imageDeliveryUrl, VIDEO_TRIM_SECONDS } from "./cloudinary.js?v=20260823a";
import { autoQualityEnabled } from "./site-config.js?v=20260823a";
import {
  doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, updateDoc, writeBatch,
  collection, collectionGroup, onSnapshot, query, orderBy, where, limit,
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


export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = VIDEO_TRIM_SECONDS;

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 600;

export function resourceTypeFor(file) {
  const type = file?.type || "";
  return type.startsWith("video/") || type.startsWith("audio/") ? "video" : "image";
}

export function isAudio(file) {
  return (file?.type || "").startsWith("audio/");
}

export function uploadAsset(file, { resourceType, onProgress } = {}) {
  const kind = resourceType || resourceTypeFor(file);

  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${kind}/upload`);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    });

    xhr.addEventListener("load", () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        let detail = "";
        try { detail = JSON.parse(xhr.responseText)?.error?.message || ""; } catch { }
        reject(new Error(
          detail
            ? `Cloudinary rejected "${file.name}": ${detail}`
            : `Cloudinary rejected "${file.name}" (${xhr.status})`
        ));
        return;
      }
      try {
        const d = JSON.parse(xhr.responseText);
        resolve({
          url: d.secure_url,
          publicId: d.public_id,
          format: d.format,
          bytes: d.bytes,
          width: d.width,
          height: d.height,
          duration: typeof d.duration === "number" ? d.duration : null,
          resourceType: d.resource_type || kind,
          filename: file.name || ""
        });
      } catch {
        reject(new Error("Cloudinary returned an unreadable response."));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error during upload.")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled.")));
    xhr.send(form);
  });
}

export async function uploadAndRecord(file, { usedFor = "artwork", onProgress } = {}) {
  const asset = await uploadAsset(file, { onProgress });
  await setDoc(doc(db, "media", slugify(asset.publicId, "asset")), {
    ...asset,
    filename: file.name,
    usedFor,
    type: asset.resourceType,
    createdAt: serverTimestamp()
  });
  return asset;
}

export function inspectVideo(file) {
  return new Promise((resolve, reject) => {
    const el = document.createElement("video");
    el.preload = "metadata";
    const src = URL.createObjectURL(file);

    const done = (result, error) => {
      URL.revokeObjectURL(src);
      el.removeAttribute("src");
      error ? reject(error) : resolve(result);
    };

    el.addEventListener("loadedmetadata", () => done({
      duration: el.duration,
      width: el.videoWidth,
      height: el.videoHeight,
      bytes: file.size
    }), { once: true });

    el.addEventListener("error", () => done(null, new Error("That file could not be read as a video.")), { once: true });
    el.src = src;
  });
}

export function videoRejectionReason({ bytes, duration }, kind = "video") {
  const audio = kind === "audio";
  const maxBytes = audio ? MAX_AUDIO_BYTES : MAX_VIDEO_BYTES;

  if (bytes > maxBytes) {
    return audio
      ? `That file is ${(bytes / 1048576).toFixed(1)} MB. Keep a background track under ${maxBytes / 1048576} MB — every listener downloads all of it, so export it at a lower bitrate.`
      : `That file is ${(bytes / 1048576).toFixed(0)} MB. Cloudinary's plan will not accept more than ${maxBytes / 1048576} MB whatever we do to it afterwards — export it smaller, or use a YouTube or Vimeo link instead.`;
  }

  if (audio && duration > MAX_AUDIO_SECONDS) {
    return `That track is ${Math.round(duration / 60)} minutes. Keep it under ${MAX_AUDIO_SECONDS / 60} — it loops, so a short piece works as well as a long one and costs a fraction as much.`;
  }

  return null;
}

export function videoTrimNotice(duration) {
  if (typeof duration !== "number" || duration <= VIDEO_TRIM_SECONDS) return "";
  const mins = Math.floor(duration / 60);
  const secs = Math.round(duration % 60);
  return `${mins}:${String(secs).padStart(2, "0")} long — visitors will see the first ${VIDEO_TRIM_SECONDS / 60} minutes. The full upload is kept, so this can be changed later.`;
}


export function publicIdFromUrl(url) {
  if (typeof url !== "string" || !url.includes("/upload/")) return null;
  let tail = url.split("/upload/")[1];
  if (!tail) return null;
  tail = tail.replace(/^(?:[^/]+\/)*?v\d+\//, "");
  return decodeURIComponent(tail.replace(/\.[a-z0-9]+$/i, "")) || null;
}

export function watchMedia(callback, onError) {
  return onSnapshot(collection(db, "media"), (snap) => {
    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.seconds || 0 }))
      .sort((a, b) => b.createdAt - a.createdAt);
    callback(items);
  }, (err) => {
    console.error("watchMedia error:", err);
    onError?.(err);
  });
}

export async function recordMedia(asset, usedFor) {
  if (!asset?.publicId) return;
  await setDoc(doc(db, "media", slugify(asset.publicId, "asset")), {
    ...asset,
    usedFor: usedFor || "unknown",
    type: asset.resourceType || "image",
    createdAt: serverTimestamp()
  }, { merge: true });
}

export async function deleteMedia(mediaId, publicId, resourceType = "image") {
  const { getFunctions, httpsCallable } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-functions.js");
  const call = httpsCallable(getFunctions(getApp()), "deleteCloudinaryAsset");
  await call({ publicId, resourceType });
  await deleteDoc(doc(db, "media", mediaId));
}

export async function grantAdminClaim() {
  const { getFunctions, httpsCallable } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-functions.js");
  const call = httpsCallable(getFunctions(getApp()), "grantAdminClaim");
  const res = await call({});
  return res.data;
}


export async function logChange(action, resource, detail) {
  try {
    await addDoc(collection(db, "changeLog"), {
      action,
      resource: resource || "",
      detail: detail || "",
      actor: auth.currentUser?.email || auth.currentUser?.uid || "unknown",
      createdAt: serverTimestamp()
    });
  } catch (err) {
    console.warn("changeLog write failed:", err);
  }
}

export function watchChangeLog(callback, onError) {
  const q = query(collection(db, "changeLog"), orderBy("createdAt", "desc"), limit(200));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      createdAt: d.data().createdAt?.toMillis?.() || 0
    })));
  }, (err) => {
    console.error("watchChangeLog error:", err);
    onError?.(err);
  });
}


function categoryPath(kind) {
  return kind === "comics" ? "comicCategories" : "artCategories";
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


function normaliseArtwork(id, data) {
  return {
    id,
    category: data.category || "general",
    title: data.title || "Untitled",
    hasTitle: typeof data.title === "string" && data.title.trim() !== "",
    archive: data.archive === true,
    hidden: data.hidden === true,
    description: data.description || "",
    imageUrl: imageDeliveryUrl(data.imageUrl || "", autoQualityEnabled()),
    likes: data.likes || 0,
    uploaded: data.uploaded === true,
    publicId: data.publicId || null,
    status: data.status || (data.uploaded === true ? "published" : "draft"),
    featured: data.featured === true,
    order: typeof data.order === "number" ? data.order : 0,
    createdAt: data.createdAt?.seconds || 0
  };
}

export function watchArtworks(categorySlug, callback, onError) {
  const ref = categorySlug
    ? query(collection(db, "artworks"),
            where("category", "==", categorySlug),
            where("status", "==", "published"))
    : query(collection(db, "artworks"), where("status", "==", "published"));

  return onSnapshot(ref, (snap) => {
    const items = snap.docs
      .map(d => normaliseArtwork(d.id, d.data()))
      .filter(a => a.imageUrl && a.uploaded)
      .sort((a, b) => b.createdAt - a.createdAt);
    callback(items);
  }, (err) => {
    console.error("watchArtworks error:", err);
    onError?.(err);
  });
}

export function watchGalleryPieces(categorySlug, callback, onError, { includeDrafts = false } = {}) {
  const base = [collection(db, "artworks"), where("category", "==", categorySlug)];
  const ref = includeDrafts
    ? query(...base)
    : query(...base, where("status", "==", "published"));

  return onSnapshot(ref, (snap) => {
    const all = snap.docs.map(d => normaliseArtwork(d.id, d.data()));

    callback({
      uploaded: all
        .filter(a => a.imageUrl && a.uploaded)
        .sort((a, b) => b.createdAt - a.createdAt),
      archive: all
        .filter(a => a.imageUrl && !a.uploaded && a.archive)
        .sort((a, b) => a.order - b.order)
    });
  }, (err) => {
    console.error("watchGalleryPieces error:", err);
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

export async function createArtwork({
  categorySlug, file, title, description, imageUrl, publicId,
  status = "published", onProgress
}) {
  let url = imageUrl;
  let assetId = publicId || null;

  if (!url) {
    const asset = await uploadAndRecord(file, { usedFor: "artwork", onProgress });
    url = asset.url;
    assetId = asset.publicId;
  }

  const name = (title || file?.name || "Untitled").trim();
  const id = artworkId(categorySlug, name);

  await setDoc(doc(db, "artworks", id), {
    category: categorySlug,
    title: name,
    description: description || "",
    imageUrl: url,
    publicId: assetId,
    likes: 0,
    status,
    featured: false,
    order: 0,
    createdAt: serverTimestamp(),
    uploaded: true
  }, { merge: true });

  await logChange("artwork.create", id, name);
  return { id, imageUrl: url, publicId: assetId };
}

export async function updateArtwork(id, patch) {
  await updateDoc(doc(db, "artworks", id), patch);
}

export function archivePieceId(categorySlug, index) {
  return `${categorySlug}-archive-${index + 1}`;
}

export async function saveArchivePiece(id, { categorySlug, title, description }) {
  const name = (title || "").trim();
  await setDoc(doc(db, "artworks", id), {
    category: categorySlug,
    title: name,
    description: (description || "").trim(),
    archive: true,
    status: "published"
  }, { merge: true });
  await logChange("artwork.rename", id, name || "(cleared)");
}

export async function deleteArtwork(id) {
  await deleteDoc(doc(db, "artworks", id));
}


export async function setArchiveVisibility(id, visible) {
  await updateDoc(doc(db, "artworks", id), { hidden: !visible });
  await logChange(visible ? "archive.show" : "archive.hide", id, "");
}

export async function replaceArchiveImage(id, { imageUrl, publicId }) {
  await updateDoc(doc(db, "artworks", id), { imageUrl, publicId: publicId || null });
  await logChange("archive.replace", id, imageUrl);
}

export async function reorderArchivePieces(orderedIds) {
  const batch = writeBatch(db);
  orderedIds.forEach((id, i) => batch.update(doc(db, "artworks", id), { order: i }));
  await batch.commit();
}

export async function moveArchiveToCloudinary(pieces, onProgress) {
  const pending = pieces.filter(p => p.imageUrl && !/^https?:/i.test(p.imageUrl));
  let done = 0;
  const failures = [];

  for (const piece of pending) {
    try {
      const response = await fetch(piece.imageUrl);
      if (!response.ok) throw new Error(`could not read ${piece.imageUrl}`);
      const blob = await response.blob();
      const name = piece.imageUrl.split("/").pop();
      const file = new File([blob], name, { type: blob.type || "image/jpeg" });

      const asset = await uploadAndRecord(file, {
        usedFor: "archive",
        onProgress: (p) => onProgress?.(done + p, pending.length, name)
      });

      await replaceArchiveImage(piece.id, { imageUrl: asset.url, publicId: asset.publicId });
    } catch (err) {
      console.error("archive migration failed for", piece.id, err);
      failures.push(`${piece.id}: ${err.message}`);
    }
    done++;
    onProgress?.(done, pending.length, "");
  }

  await logChange("archive.toCloudinary", pieces[0]?.category || "", `${done - failures.length} of ${pending.length} moved`);
  return { moved: done - failures.length, total: pending.length, failures };
}


function normaliseComic(id, data) {
  return {
    id,
    title: data.title || "Untitled Story",
    categorySlug: data.categorySlug || "uncategorised",
    description: data.description || "",
    coverUrl: imageDeliveryUrl(data.coverUrl || data.pages?.[0] || "", autoQualityEnabled()),
    pages: Array.isArray(data.pages)
      ? data.pages.filter(Boolean).map(p => imageDeliveryUrl(p, autoQualityEnabled()))
      : [],
    likes: data.likes || 0,
    order: typeof data.order === "number" ? data.order : 0,
    status: data.status || "published",
    featured: data.featured === true,
    coverPublicId: data.coverPublicId || null,
    createdAt: data.createdAt?.seconds || 0
  };
}

function readComics(publishedOnly) {
  return publishedOnly
    ? query(collection(db, "comics"), where("status", "==", "published"))
    : collection(db, "comics");
}

function shelfItems(snap, publishedOnly) {
  return snap.docs
    .map(d => normaliseComic(d.id, d.data()))
    .filter(c => !publishedOnly || c.coverUrl || c.pages.length)
    .sort((a, b) => a.order - b.order || b.createdAt - a.createdAt);
}

export function watchComics(callback, onError, { publishedOnly = false } = {}) {
  return onSnapshot(readComics(publishedOnly), (snap) => {
    callback(shelfItems(snap, publishedOnly));
  }, (err) => {
    console.error("watchComics error:", err);
    onError?.(err);
  });
}

export async function fetchComics({ publishedOnly = true } = {}) {
  try {
    return shelfItems(await getDocs(readComics(publishedOnly)), publishedOnly);
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
  try { localStorage.setItem(LIKED_KEY, JSON.stringify(liked)); } catch { }
}

function likeSeed() {
  return { likes: 1, status: "published", createdAt: serverTimestamp() };
}

export async function toggleLike(collectionName, id) {
  if (hasLiked(id)) return false;
  const ref = doc(db, collectionName, id);

  if ((await getDoc(ref)).exists()) {
    await updateDoc(ref, { likes: increment(1) });
  } else {
    try {
      await setDoc(ref, likeSeed());
    } catch (err) {
      if (!(await getDoc(ref)).exists()) throw err;
      await updateDoc(ref, { likes: increment(1) });
    }
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

export function watchPieceMeta(collectionName, id, callback, onError) {
  return onSnapshot(doc(db, collectionName, id), (snap) => {
    const d = snap.exists() ? snap.data() : {};
    callback({
      likes: d.likes || 0,
      title: (d.title || "").trim(),
      description: (d.description || "").trim()
    });
  }, (err) => {
    console.error("watchPieceMeta error for", id, err);
    onError?.(err);
  });
}


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
