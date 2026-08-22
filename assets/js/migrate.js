import { db } from "../../firebase-config.js?v=20260822b";
import { publicIdFromUrl, slugify, logChange } from "./data.js?v=20260822b";
import {
  collection, doc, getDocs, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

/**
 * One-time migration to the Stage 2 schema. Every step is idempotent: running
 * it twice changes nothing the second time, so a partial failure can simply be
 * re-run.
 *
 * Must complete BEFORE the tightened rules are published — public reads will
 * require status == "published", and documents predating this have no status.
 */

const BATCH_LIMIT = 400;

async function commitInChunks(writes) {
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    writes.slice(i, i + BATCH_LIMIT).forEach(({ ref, data, merge }) =>
      batch.set(ref, data, { merge: merge !== false }));
    await batch.commit();
  }
}

async function planArtworks() {
  const snap = await getDocs(collection(db, "artworks"));
  const writes = [];
  const notes = [];
  let alreadyDone = 0;
  let orphanImages = 0;

  snap.forEach((d) => {
    const data = d.data();
    const patch = {};

    if (typeof data.status !== "string") {
      // Anything the old admin uploaded was live; anything else was a like-only
      // stub created by a guest and was never on the site.
      patch.status = data.uploaded === true ? "published" : "archived";
    }
    if (data.featured !== true && data.featured !== false) patch.featured = false;
    if (typeof data.order !== "number") patch.order = 0;

    if (!data.publicId && data.imageUrl) {
      const pid = publicIdFromUrl(data.imageUrl);
      if (pid) patch.publicId = pid;
      else orphanImages++;
    }

    if (Object.keys(patch).length) writes.push({ ref: doc(db, "artworks", d.id), data: patch });
    else alreadyDone++;
  });

  notes.push(`${snap.size} artworks scanned`);
  if (alreadyDone) notes.push(`${alreadyDone} already migrated`);
  if (orphanImages) notes.push(`${orphanImages} images are not Cloudinary-hosted and cannot be given a delete handle`);

  return { label: "Artworks", writes, notes };
}

async function planComics() {
  const snap = await getDocs(collection(db, "comics"));
  const writes = [];
  let alreadyDone = 0;

  snap.forEach((d) => {
    const data = d.data();
    const patch = {};
    if (typeof data.status !== "string") patch.status = "published";
    if (data.featured !== true && data.featured !== false) patch.featured = false;
    if (!data.coverPublicId && data.coverUrl) {
      const pid = publicIdFromUrl(data.coverUrl);
      if (pid) patch.coverPublicId = pid;
    }
    if (Object.keys(patch).length) writes.push({ ref: doc(db, "comics", d.id), data: patch });
    else alreadyDone++;
  });

  return {
    label: "Comics",
    writes,
    notes: [`${snap.size} comics scanned`, alreadyDone ? `${alreadyDone} already migrated` : null].filter(Boolean)
  };
}

async function planCategoryRename() {
  const [legacy, target] = await Promise.all([
    getDocs(collection(db, "categories")),
    getDocs(collection(db, "artCategories"))
  ]);

  const existing = new Set(target.docs.map(d => d.id));
  const writes = legacy.docs
    .filter(d => !existing.has(d.id))
    .map(d => ({ ref: doc(db, "artCategories", d.id), data: d.data(), merge: false }));

  const notes = [`${legacy.size} in legacy "categories", ${target.size} already in "artCategories"`];
  if (legacy.size && !writes.length) notes.push("nothing new to copy");
  if (writes.length) notes.push("the legacy collection is left in place; delete it manually once verified");

  return { label: "Categories -> artCategories", writes, notes };
}

async function planMediaBackfill() {
  const [artworks, comics, media] = await Promise.all([
    getDocs(collection(db, "artworks")),
    getDocs(collection(db, "comics")),
    getDocs(collection(db, "media"))
  ]);

  const known = new Set(media.docs.map(d => d.id));
  const seen = new Set();
  const writes = [];

  const add = (url, usedFor) => {
    if (!url) return;
    const publicId = publicIdFromUrl(url);
    if (!publicId) return;
    const id = slugify(publicId, "asset");
    if (known.has(id) || seen.has(id)) return;
    seen.add(id);
    writes.push({
      ref: doc(db, "media", id),
      data: {
        publicId,
        url,
        type: "image",
        resourceType: "image",
        usedFor,
        backfilled: true,
        createdAt: serverTimestamp()
      }
    });
  };

  artworks.forEach(d => add(d.data().imageUrl, "artwork"));
  comics.forEach((d) => {
    add(d.data().coverUrl, "comic-cover");
    (d.data().pages || []).forEach(url => add(url, "comic-page"));
  });

  return {
    label: "Media library backfill",
    writes,
    notes: [`${media.size} already tracked`, `${writes.length} Cloudinary assets to register`]
  };
}

async function planComicCategorySeed() {
  const snap = await getDocs(collection(db, "comicCategories"));
  if (!snap.empty) {
    return { label: "Comic genres", writes: [], notes: [`${snap.size} already present, leaving untouched`] };
  }

  const GENRES = [
    "Action", "Adventure", "Fantasy", "Drama", "Romance", "Horror", "Mystery",
    "Thriller", "Sci-Fi", "Superhero", "Comedy", "Historical", "Crime",
    "Psychological", "Slice of Life", "Dark Fantasy", "Supernatural",
    "Martial Arts", "Coming of Age", "Mythology"
  ];

  const writes = GENRES.map((name, i) => ({
    ref: doc(db, "comicCategories", slugify(name, "genre")),
    data: {
      slug: slugify(name, "genre"),
      name,
      tagline: "",
      blurb: "",
      order: i,
      createdAt: serverTimestamp()
    },
    merge: false
  }));

  return { label: "Comic genres", writes, notes: [`seeding ${GENRES.length} genres (all editable in admin)`] };
}

const STEPS = [
  planArtworks,
  planComics,
  planCategoryRename,
  planComicCategorySeed,
  planMediaBackfill
];

/** Reports exactly what would change, without writing anything. */
export async function dryRun() {
  const plans = [];
  for (const step of STEPS) plans.push(await step());
  return {
    plans,
    totalWrites: plans.reduce((n, p) => n + p.writes.length, 0)
  };
}

/** Applies the plan. Safe to re-run: each step re-plans against current state. */
export async function apply(onProgress) {
  const results = [];
  for (let i = 0; i < STEPS.length; i++) {
    const plan = await STEPS[i]();
    onProgress?.(plan.label, i, STEPS.length);
    if (plan.writes.length) await commitInChunks(plan.writes);
    results.push({ label: plan.label, written: plan.writes.length, notes: plan.notes });
  }

  const total = results.reduce((n, r) => n + r.written, 0);
  await logChange("migration.run", "stage-2", `${total} documents written`);
  return { results, totalWrites: total };
}
