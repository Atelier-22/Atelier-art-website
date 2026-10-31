import { db, auth } from "../../firebase-config.js?v=20261031a";
import { imageDeliveryUrl, VIDEO_TRIM_SECONDS } from "./cloudinary.js?v=20261031a";
import { autoQualityEnabled } from "./site-config.js?v=20261031a";
import {
  doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, updateDoc, writeBatch,
  collection, collectionGroup, onSnapshot, query, orderBy, where, limit,
  serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export const CLOUDINARY_CLOUD_NAME = "pmhpabd8";
export const CLOUDINARY_UPLOAD_PRESET = "lpwbmgnq";

let uploadNamespace = null;

export function setUploadNamespace(prefix) {
  uploadNamespace = prefix ? String(prefix) : null;
}

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
  return `${categorySlug}-${slugify(titleOrFilename, "artwork")}-${Date.now().toString(36)}`;
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

function freshPublicId() {
  const random = Math.random().toString(36).slice(2, 10);
  return `${uploadNamespace || ""}${Date.now().toString(36)}${random}`;
}

export function uploadAsset(file, { resourceType, onProgress } = {}) {
  const kind = resourceType || resourceTypeFor(file);

  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    form.append("public_id", freshPublicId());
    if (uploadNamespace) form.append("asset_folder", uploadNamespace.replace(/-+$/, "") + "-folder");

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${kind}/upload`);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    });

    xhr.addEventListener("load", () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        let detail = "";
        try { detail = JSON.parse(xhr.responseText)?.error?.message || ""; }
        catch (err) { console.error("Cloudinary error body was not JSON.", err); }
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
      } catch (err) {
        console.error("Cloudinary returned an unreadable response.", err);
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
  try {
    await setDoc(doc(db, "media", mediaIdFor(asset.publicId)), {
      ...asset,
      filename: file.name,
      usedFor,
      type: asset.resourceType,
      createdAt: serverTimestamp()
    });
  } catch (err) {
    console.error("The upload worked but its media record could not be saved; removing the upload.", err);
    await destroyAsset(asset.publicId, asset.resourceType);
    throw err;
  }
  return asset;
}

export function mediaIdFor(publicId) {
  return slugify(publicId, "asset");
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
  if (typeof url !== "string" || !url.includes("res.cloudinary.com") || !url.includes("/upload/")) return null;
  let tail = url.split("/upload/")[1];
  if (!tail) return null;
  const versioned = tail.match(/(?:^|\/)v\d+\/(.+)$/);
  if (versioned) tail = versioned[1];
  else tail = tail.replace(/^(?:[a-z]{1,3}_[^/]*\/)+/i, "");
  return decodeURIComponent(tail.replace(/\.[a-z0-9]+$/i, "")) || null;
}

export function assetFromUrl(url) {
  const publicId = publicIdFromUrl(url);
  if (!publicId) return null;
  const resourceType = /\/video\/upload\//.test(url) ? "video" : /\/raw\/upload\//.test(url) ? "raw" : "image";
  return { publicId, resourceType };
}

async function adminRequest(path, body) {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in again — the session has ended.");
  const token = await user.getIdToken();
  let response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    });
  } catch (err) {
    console.error(`Request to ${path} failed.`, err);
    throw new Error("The server could not be reached, so nothing was changed.");
  }
  let payload = {};
  try { payload = await response.json(); }
  catch (err) { console.error(`${path} returned a non-JSON body.`, err); }
  if (!response.ok) {
    const detail = typeof payload.detail === "string" ? payload.detail : `HTTP ${response.status}`;
    throw new Error(`The server refused: ${detail}`);
  }
  return payload;
}

export async function destroyAsset(publicId, resourceType = "image") {
  if (!publicId) throw new Error("No Cloudinary public ID to delete.");
  return adminRequest("/api/admin/assets/destroy", { publicId, resourceType });
}

function collectStrings(value, out) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach(v => collectStrings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach(v => collectStrings(v, out));
  return out;
}

export async function assetReferenceCount(publicId, { skip = () => false } = {}) {
  if (!publicId) return 0;
  const [artworks, comics, categories, config] = await Promise.all([
    getDocs(collection(db, "artworks")),
    getDocs(collection(db, "comics")),
    getDocs(collection(db, "artCategories")),
    getDoc(doc(db, "siteConfig", "published"))
  ]);
  let count = 0;
  const scan = (where, data) => {
    collectStrings(data, []).forEach((value, index) => {
      if (publicIdFromUrl(value) === publicId && !skip(where, value, index)) count++;
    });
  };
  artworks.docs.forEach(d => scan(`artworks/${d.id}`, d.data()));
  comics.docs.forEach(d => scan(`comics/${d.id}`, d.data()));
  categories.docs.forEach(d => scan(`artCategories/${d.id}`, d.data()));
  if (config.exists()) scan("siteConfig/published", config.data());
  return count;
}

export async function releaseAsset(url, { ownerPath, expectedInOwner = 1 } = {}) {
  const asset = assetFromUrl(url);
  if (!asset) return { destroyed: false, reason: "not-cloudinary" };
  let seenInOwner = 0;
  const others = await assetReferenceCount(asset.publicId, {
    skip: (where) => {
      if (where !== ownerPath || seenInOwner >= expectedInOwner) return false;
      seenInOwner++;
      return true;
    }
  });
  if (others > 0) return { destroyed: false, reason: "in-use", ...asset };
  await destroyAsset(asset.publicId, asset.resourceType);
  return { destroyed: true, ...asset };
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

export async function grantAdminClaim() {
  return adminRequest("/api/admin/claim", {});
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
    console.error("changeLog write failed:", err);
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

function normaliseCategory(id, data, index) {
  return {
    id,
    slug: data.slug || id,
    name: typeof data.name === "string" ? data.name : id,
    tagline: typeof data.tagline === "string" ? data.tagline : "",
    blurb: typeof data.blurb === "string" ? data.blurb : "",
    cover: typeof data.cover === "string" ? data.cover : "",
    order: typeof data.order === "number" ? data.order : index
  };
}

export function watchCategories(kind, callback, onError) {
  return onSnapshot(collection(db, categoryPath(kind)), (snap) => {
    const items = snap.docs
      .filter(d => !d.id.startsWith("_"))
      .map((d, i) => normaliseCategory(d.id, d.data(), i))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    callback(items);
  }, (err) => {
    console.error(`watchCategories(${kind}) error:`, err);
    onError?.(err);
  });
}

export async function createCategory(kind, name) {
  const clean = (name || "").trim();
  if (!clean) throw new Error("Give it a name.");
  const slug = slugify(clean, "category");
  const ref = doc(db, categoryPath(kind), slug);
  if ((await getDoc(ref)).exists()) {
    throw new Error(`A category with the slug "${slug}" already exists.`);
  }
  const existing = await getDocs(collection(db, categoryPath(kind)));
  await setDoc(ref, {
    slug,
    name: clean,
    tagline: "",
    blurb: "",
    cover: "",
    order: existing.docs.filter(d => !d.id.startsWith("_")).length,
    createdAt: serverTimestamp()
  });
  await logChange("category.create", `${kind}/${slug}`, clean);
  return slug;
}

export async function updateCategory(kind, id, patch) {
  await updateDoc(doc(db, categoryPath(kind), id), patch);
  await logChange("category.update", `${kind}/${id}`, Object.keys(patch).join(", "));
}

export async function setCategoryCover(id, nextUrl) {
  const ref = doc(db, "artCategories", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("That collection no longer exists.");
  const previous = snap.data().cover || "";
  if (previous === nextUrl) return { released: null };
  if (!nextUrl && previous) {
    const released = await releaseAsset(previous, { ownerPath: `artCategories/${id}` });
    await updateDoc(ref, { cover: "" });
    await logChange("category.cover", `art/${id}`, "cleared");
    return { released };
  }
  await updateDoc(ref, { cover: nextUrl });
  await logChange("category.cover", `art/${id}`, nextUrl);
  const released = previous ? await releaseAsset(previous, { ownerPath: `artCategories/${id}`, expectedInOwner: 0 }) : null;
  return { released };
}

export async function reorderCategories(kind, orderedIds) {
  const batch = writeBatch(db);
  orderedIds.forEach((id, i) => batch.update(doc(db, categoryPath(kind), id), { order: i }));
  await batch.commit();
}

export async function deleteCategory(kind, id, { onProgress } = {}) {
  const isComics = kind === "comics";
  const items = await getDocs(query(
    collection(db, isComics ? "comics" : "artworks"),
    where(isComics ? "categorySlug" : "category", "==", id)
  ));
  let removed = 0;
  for (const item of items.docs) {
    onProgress?.(removed, items.size);
    if (isComics) await deleteComic(item.id);
    else await deleteArtwork(item.id);
    removed++;
  }
  if (!isComics) {
    const cat = await getDoc(doc(db, "artCategories", id));
    const cover = cat.exists() ? cat.data().cover || "" : "";
    if (cover) await releaseAsset(cover, { ownerPath: `artCategories/${id}` });
  }
  await deleteDoc(doc(db, categoryPath(kind), id));
  await logChange("category.delete", `${kind}/${id}`, `${removed} items removed`);
  return { removed };
}


function normaliseArtwork(id, data) {
  return {
    id,
    category: data.category || "",
    title: typeof data.title === "string" ? data.title : "",
    caption: typeof data.caption === "string" ? data.caption : "",
    description: typeof data.description === "string" ? data.description : "",
    imageUrl: imageDeliveryUrl(data.imageUrl || "", autoQualityEnabled()),
    originalUrl: data.imageUrl || "",
    likes: data.likes || 0,
    uploaded: data.uploaded === true,
    publicId: data.publicId || null,
    status: data.status || "draft",
    hidden: data.status === "draft",
    order: typeof data.order === "number" ? data.order : 0,
    createdAt: data.createdAt?.seconds || 0
  };
}

export function sortArtworks(list) {
  return list.slice().sort((a, b) => a.order - b.order || b.createdAt - a.createdAt);
}

export function watchArtworks(categorySlug, callback, onError) {
  const ref = categorySlug
    ? query(collection(db, "artworks"), where("status", "==", "published"), where("category", "==", categorySlug))
    : query(collection(db, "artworks"), where("status", "==", "published"));

  return onSnapshot(ref, (snap) => {
    const items = snap.docs
      .map(d => normaliseArtwork(d.id, d.data()))
      .filter(a => a.uploaded && a.imageUrl);
    callback(sortArtworks(items));
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

export async function createArtwork({
  categorySlug, file, title, caption, description, onProgress, onStatus
}) {
  const name = (title || file?.name || "").trim().replace(/\.[a-z0-9]+$/i, "");
  const id = artworkId(categorySlug, name || "artwork");
  const asset = await uploadAndRecord(file, { usedFor: "artwork", onProgress });

  onStatus?.("Saving to the site…");

  try {
    await setDoc(doc(db, "artworks", id), {
      category: categorySlug,
      title: name,
      caption: (caption || "").trim(),
      description: (description || "").trim(),
      imageUrl: asset.url,
      publicId: asset.publicId,
      likes: 0,
      status: "published",
      order: -Math.floor(Date.now() / 1000),
      createdAt: serverTimestamp(),
      uploaded: true
    });
  } catch (err) {
    console.error("Artwork record failed; removing the upload.", err);
    try { await destroyAsset(asset.publicId, asset.resourceType); }
    catch (cleanupError) { console.error("Could not clean up an artwork upload after its record failed.", cleanupError); }
    throw err;
  }

  await logChange("artwork.create", id, name);
  return { id, imageUrl: asset.url, publicId: asset.publicId };
}

export async function updateArtwork(id, patch) {
  await updateDoc(doc(db, "artworks", id), patch);
  await logChange("artwork.update", id, Object.keys(patch).join(", "));
}

export async function setArtworkVisibility(id, visible) {
  await updateDoc(doc(db, "artworks", id), { status: visible ? "published" : "draft" });
  await logChange(visible ? "artwork.show" : "artwork.hide", id, "");
}

export async function replaceArtworkImage(id, file, { onProgress } = {}) {
  const ref = doc(db, "artworks", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("That artwork no longer exists.");
  const previous = snap.data().imageUrl || "";
  const asset = await uploadAndRecord(file, { usedFor: "artwork", onProgress });
  try {
    await updateDoc(ref, { imageUrl: asset.url, publicId: asset.publicId });
  } catch (err) {
    console.error("Could not point the artwork at its new image; removing the new upload.", err);
    try { await destroyAsset(asset.publicId, asset.resourceType); }
    catch (cleanupError) { console.error("Cleanup of the new upload failed.", cleanupError); }
    throw err;
  }
  await logChange("artwork.replace", id, asset.url);
  const released = previous ? await releaseAsset(previous, { ownerPath: `artworks/${id}`, expectedInOwner: 0 }) : null;
  return { imageUrl: asset.url, publicId: asset.publicId, released };
}

export async function reorderArtworks(orderedIds) {
  const batch = writeBatch(db);
  orderedIds.forEach((id, i) => batch.update(doc(db, "artworks", id), { order: i }));
  await batch.commit();
}

async function deleteChildren(path) {
  const snap = await getDocs(collection(db, ...path));
  for (const child of snap.docs) await deleteDoc(child.ref);
}

export async function deleteArtwork(id) {
  const ref = doc(db, "artworks", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { removed: false };
  const imageUrl = snap.data().imageUrl || "";
  const released = imageUrl ? await releaseAsset(imageUrl, { ownerPath: `artworks/${id}` }) : null;
  await deleteChildren(["artworks", id, "comments"]);
  await deleteDoc(ref);
  await logChange("artwork.delete", id, imageUrl);
  return { removed: true, released };
}


function normaliseComic(id, data) {
  const pages = Array.isArray(data.pages) ? data.pages.filter(Boolean) : [];
  return {
    id,
    title: typeof data.title === "string" ? data.title : "",
    categorySlug: data.categorySlug || "",
    description: typeof data.description === "string" ? data.description : "",
    coverUrl: imageDeliveryUrl(data.coverUrl || "", autoQualityEnabled()),
    originalCoverUrl: data.coverUrl || "",
    pages: pages.map(p => imageDeliveryUrl(p, autoQualityEnabled())),
    originalPages: pages,
    likes: data.likes || 0,
    order: typeof data.order === "number" ? data.order : 0,
    status: data.status || "draft",
    createdAt: data.createdAt?.seconds || 0
  };
}

function sortComics(list) {
  return list.slice().sort((a, b) => a.order - b.order || b.createdAt - a.createdAt);
}

export function watchComics(callback, onError, { publishedOnly = false } = {}) {
  const ref = publishedOnly
    ? query(collection(db, "comics"), where("status", "==", "published"))
    : collection(db, "comics");
  return onSnapshot(ref, (snap) => {
    callback(sortComics(snap.docs.map(d => normaliseComic(d.id, d.data()))));
  }, (err) => {
    console.error("watchComics error:", err);
    onError?.(err);
  });
}

export async function createComic({ title, categorySlug, description, coverUrl, pages }) {
  const clean = (title || "").trim();
  if (!clean) throw new Error("Give the story a title.");
  const id = slugify(clean, "story");
  const ref = doc(db, "comics", id);
  if ((await getDoc(ref)).exists()) throw new Error(`A story called "${clean}" already exists.`);

  await setDoc(ref, {
    title: clean,
    categorySlug,
    description: description || "",
    coverUrl: coverUrl || "",
    pages,
    likes: 0,
    status: "published",
    order: -Math.floor(Date.now() / 1000),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await logChange("comic.create", id, clean);
  return id;
}

export async function updateComic(id, patch) {
  const ref = doc(db, "comics", id);
  const before = await getDoc(ref);
  if (!before.exists()) throw new Error("That story no longer exists.");
  const old = before.data();
  await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
  await logChange("comic.update", id, Object.keys(patch).join(", "));
  const after = { ...old, ...patch };
  const keep = new Set([after.coverUrl, ...(after.pages || [])].map(publicIdFromUrl).filter(Boolean));
  const dropped = [...new Set([old.coverUrl, ...(old.pages || [])].filter(url => {
    const pid = publicIdFromUrl(url);
    return pid && !keep.has(pid);
  }))];
  const released = [];
  for (const url of dropped) released.push(await releaseAsset(url, { ownerPath: `comics/${id}`, expectedInOwner: 0 }));
  return { released };
}

export async function setComicVisibility(id, visible) {
  await updateDoc(doc(db, "comics", id), { status: visible ? "published" : "draft", updatedAt: serverTimestamp() });
  await logChange(visible ? "comic.show" : "comic.hide", id, "");
}

export async function deleteComic(id) {
  const ref = doc(db, "comics", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { removed: false, pages: 0 };
  const data = snap.data();
  const urls = [...new Set([data.coverUrl, ...(Array.isArray(data.pages) ? data.pages : [])].filter(Boolean))];
  const released = [];
  for (const url of urls) {
    const owned = [data.coverUrl, ...(data.pages || [])].filter(u => publicIdFromUrl(u) === publicIdFromUrl(url)).length;
    released.push(await releaseAsset(url, { ownerPath: `comics/${id}`, expectedInOwner: owned }));
  }
  await deleteChildren(["comics", id, "comments"]);
  const chapters = await getDocs(collection(db, "comics", id, "chapters"));
  for (const chapter of chapters.docs) {
    await deleteChildren(["comics", id, "chapters", chapter.id, "pages"]);
    await deleteDoc(chapter.ref);
  }
  await deleteDoc(ref);
  await logChange("comic.delete", id, `${urls.length} images`);
  return { removed: true, pages: (data.pages || []).length, released };
}

export async function reorderComics(orderedIds) {
  const batch = writeBatch(db);
  orderedIds.forEach((id, i) => batch.update(doc(db, "comics", id), { order: i }));
  await batch.commit();
}


const LIKED_KEY = "alafi_liked_ids";

export function getLikedIds() {
  try { return JSON.parse(localStorage.getItem(LIKED_KEY) || "[]"); }
  catch (err) { console.error("Liked list in localStorage is unreadable.", err); return []; }
}

export function hasLiked(id) {
  return getLikedIds().includes(id);
}

function rememberLiked(id) {
  const liked = getLikedIds();
  if (liked.includes(id)) return;
  liked.push(id);
  try { localStorage.setItem(LIKED_KEY, JSON.stringify(liked)); }
  catch (err) { console.error("Could not remember the like locally.", err); }
}

export async function toggleLike(collectionName, id) {
  if (hasLiked(id)) return false;
  await updateDoc(doc(db, collectionName, id), { likes: increment(1) });
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
