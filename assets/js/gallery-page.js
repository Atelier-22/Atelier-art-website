import { ensureGuestAuth, watchAuth, isOwner } from "../../firebase-config.js?v=20260823a";
import {
  watchGalleryPieces, watchPieceMeta, toggleLike, hasLiked,
  watchComments, addComment, deleteComment, fetchCategories, archivePieceId
} from "./data.js?v=20260823a";
import { isPreview, currentConfig } from "./site-config.js?v=20260823a";
import { LOCAL_SEEDS, CATEGORY_BY_SLUG, currentCategorySlug } from "./site-data.js?v=20260823a";
import { bindGallery } from "./lightbox.js?v=20260823a";
import { observeReveals, initNav } from "./reveal.js?v=20260823a";

/* Resolved on mount, not at import. One collection page can be replaced by
   another without the document reloading, so none of this can be captured
   once — the slug in particular changes underneath the module. */
let slug = "";
let grid = null;
let emptyEl = null;

/** artId -> { el, item, unsubscribers[] } — the live model the lightbox reads. */
let cards = new Map();
let owner = false;

/** Everything this page has subscribed to, so leaving can release all of it. */
let pageSubscriptions = [];

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

function placeholderFor(i) {
  const label = CATEGORY_BY_SLUG[slug]?.label || slug;
  return `${label.replace(/s$/, "")} No. ${String(i + 1).padStart(2, "0")}`;
}

/**
 * The bundled images, drawn straight from the shipped list.
 *
 * This is now only the fallback for a database where the archive records have
 * not been seeded yet. Once they exist the grid is built from them instead, so
 * that a piece the owner hid stays hidden rather than reappearing from here.
 */
function localItems() {
  return (LOCAL_SEEDS[slug] || []).map((src, i) => ({
    id: archivePieceId(slug, i),
    // Only a placeholder. If the owner has named this piece, the title that
    // arrives from its document replaces this on the first snapshot -- and
    // the placeholder is kept so clearing the name falls back to it.
    title: placeholderFor(i),
    placeholder: placeholderFor(i),
    imageUrl: src,
    description: "",
    archive: true
  }));
}

/** The same shape, built from the records the admin panel manages. */
function recordItems(records) {
  return records.map((record) => {
    const index = Number(String(record.id).split("-").pop()) - 1;
    const placeholder = placeholderFor(Number.isFinite(index) ? index : 0);
    return {
      id: record.id,
      title: record.hasTitle ? record.title : placeholder,
      placeholder,
      imageUrl: record.imageUrl,
      description: record.description,
      archive: true
    };
  });
}

/** Ordered list backing both the grid and the lightbox. */
function orderedItems() {
  return Array.from(grid.querySelectorAll(".art-card"))
    .map(el => cards.get(el.dataset.artId))
    .filter(Boolean)
    .map(({ item }) => ({
      id: item.id,
      src: item.imageUrl,
      title: item.title,
      meta: item.description || CATEGORY_BY_SLUG[slug]?.label || ""
    }));
}

function buildCard(item) {
  const el = document.createElement("article");
  el.className = "art-card";
  el.dataset.artId = item.id;

  el.innerHTML = `
    <button class="art-frame" type="button" data-lightbox="${escapeHtml(item.id)}"
            aria-label="View ${escapeHtml(item.title)} full size">
      <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}"
           loading="lazy" decoding="async" draggable="false">
      <span class="art-frame-hint">View</span>
    </button>
    <div class="art-body">
      <h3 class="art-title">${escapeHtml(item.title)}</h3>
      <p class="art-desc"${item.description ? "" : " hidden"}>${escapeHtml(item.description)}</p>
      <div class="art-actions">
        <button class="like-btn" type="button" aria-label="Like this piece">
          <span class="heart" aria-hidden="true">&#9825;</span>
          <span class="like-count">0</span>
        </button>
        <button class="comment-toggle" type="button" aria-expanded="false">
          Comments <span class="comment-count"></span>
        </button>
      </div>
      <p class="art-error" role="status" hidden></p>
      <div class="comments-panel" hidden>
        <div class="comments-list"></div>
        <form class="comment-form">
          <input type="text" class="comment-name" placeholder="Your name (optional)" maxlength="40">
          <textarea class="comment-text" placeholder="Say something about this piece…" maxlength="300" required></textarea>
          <button type="submit" class="link-btn">Post</button>
        </form>
      </div>
    </div>
  `;

  const img = el.querySelector("img");
  img.addEventListener("contextmenu", e => e.preventDefault());
  img.addEventListener("dragstart", e => e.preventDefault());
  img.addEventListener("error", () => el.remove(), { once: true });

  return el;
}

function showError(el, message) {
  const box = el.querySelector(".art-error");
  box.textContent = message;
  box.hidden = false;
  clearTimeout(box._timer);
  box._timer = setTimeout(() => { box.hidden = true; }, 5000);
}

function wireCard(el, item) {
  const unsubscribers = [];
  const likeBtn = el.querySelector(".like-btn");
  const heart = el.querySelector(".heart");
  const likeCount = el.querySelector(".like-count");
  const toggle = el.querySelector(".comment-toggle");
  const countBadge = el.querySelector(".comment-count");
  const panel = el.querySelector(".comments-panel");
  const list = el.querySelector(".comments-list");
  const form = el.querySelector(".comment-form");

  if (hasLiked(item.id)) {
    likeBtn.classList.add("is-liked");
    likeBtn.disabled = true;
    heart.innerHTML = "&#9829;";
  }

  // One listener carries both the like count and whatever the owner has
  // titled this piece. `entry.item` is updated too, because the lightbox
  // caption reads from it rather than from the DOM.
  unsubscribers.push(watchPieceMeta("artworks", item.id, (meta) => {
    likeCount.textContent = meta.likes;

    const entry = cards.get(item.id);
    const model = entry ? entry.item : item;

    // An archive piece falls back to its number when the owner clears the
    // name. An upload has no placeholder, so its own title stands.
    const shown = meta.title || model.placeholder || model.title;

    if (shown !== model.title) {
      model.title = shown;
      el.querySelector(".art-title").textContent = shown;
      el.querySelector(".art-frame").setAttribute("aria-label", `View ${shown} full size`);
      el.querySelector("img").alt = shown;
    }

    if (meta.description !== model.description) {
      model.description = meta.description;
      const desc = el.querySelector(".art-desc");
      desc.textContent = meta.description;
      desc.hidden = !meta.description;
    }
  }));

  likeBtn.addEventListener("click", async () => {
    likeBtn.disabled = true;
    try {
      const ok = await toggleLike("artworks", item.id);
      if (ok) {
        likeBtn.classList.add("is-liked");
        heart.innerHTML = "&#9829;";
      } else {
        likeBtn.disabled = false;
      }
    } catch (err) {
      console.error("Like failed for", item.id, err);
      likeBtn.disabled = false;
      showError(el, "Couldn't save your like — please try again.");
    }
  });

  toggle.addEventListener("click", () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    toggle.setAttribute("aria-expanded", String(opening));
  });

  unsubscribers.push(watchComments("artworks", item.id, (comments) => {
    countBadge.textContent = comments.length ? `(${comments.length})` : "";
    list.innerHTML = comments.length
      ? comments.map(c => `
          <div class="comment" data-comment-id="${escapeHtml(c.id)}">
            <strong>${escapeHtml(c.name)}</strong>
            <span>${escapeHtml(c.text)}</span>
            ${owner ? '<button class="comment-del" type="button" aria-label="Delete comment">&times;</button>' : ""}
          </div>`).join("")
      : '<p class="no-comments">No comments yet — be the first.</p>';
  }));

  list.addEventListener("click", async (e) => {
    const btn = e.target.closest(".comment-del");
    if (!btn) return;
    const id = btn.closest(".comment").dataset.commentId;
    if (!confirm("Delete this comment?")) return;
    try { await deleteComment("artworks", item.id, id); }
    catch (err) { showError(el, "Couldn't delete that comment."); console.error(err); }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = form.querySelector(".comment-text");
    if (!text.value.trim()) return;
    const submit = form.querySelector("button[type=submit]");
    submit.disabled = true;
    try {
      await addComment("artworks", item.id, form.querySelector(".comment-name").value, text.value);
      text.value = "";
    } catch (err) {
      console.error("Comment failed for", item.id, err);
      showError(el, "Couldn't post your comment — please try again.");
    } finally {
      submit.disabled = false;
    }
  });

  return unsubscribers;
}

function addCard(item) {
  if (cards.has(item.id)) return;
  const el = buildCard(item);
  el.setAttribute("data-reveal", "scale");
  const unsubscribers = wireCard(el, item);
  cards.set(item.id, { el, item, unsubscribers });
  grid.appendChild(el);
  observeReveals(grid);
}

function removeCard(id) {
  const entry = cards.get(id);
  if (!entry) return;
  entry.unsubscribers.forEach(unsub => { try { unsub(); } catch { /* already gone */ } });
  entry.el.remove();
  cards.delete(id);
}

/**
 * Reconciles what's on screen against the snapshot instead of tearing the grid
 * down and rebuilding it. The old renderer rebuilt every card on every
 * snapshot — and a like triggers a snapshot — which re-registered listeners
 * without unsubscribing and made cards visibly restack.
 */
function sync({ uploaded, archive }) {
  // A non-empty archive list means the records exist, so they are the truth
  // about which bundled pieces belong on the page and in what order. Empty
  // means they have never been seeded, and the shipped list stands in.
  const archiveItems = archive.length
    ? recordItems(archive.filter(a => !a.hidden))
    : localItems();

  const ordered = [...uploaded, ...archiveItems];
  const incoming = new Set(ordered.map(i => i.id));

  cards.forEach((_, id) => { if (!incoming.has(id)) removeCard(id); });

  ordered.forEach((item) => {
    const existing = cards.get(item.id);
    if (!existing) {
      addCard(item);
      return;
    }
    if (existing.item.title !== item.title || existing.item.imageUrl !== item.imageUrl) {
      existing.item = { ...existing.item, ...item };
      existing.el.querySelector(".art-title").textContent = item.title;
      const img = existing.el.querySelector("img");
      if (img.getAttribute("src") !== item.imageUrl) img.src = item.imageUrl;
    }
  });

  // Seat every card in snapshot order: uploads newest-first, then the archive
  // in whatever order the owner arranged. Moving each one after the previous
  // keeps the sequence; prepending one at a time would reverse it.
  let anchor = null;
  ordered.forEach((item) => {
    const el = cards.get(item.id)?.el;
    if (!el) return;
    if (anchor) anchor.after(el);
    else grid.prepend(el);
    anchor = el;
  });

  updateEmptyState();
}

function updateEmptyState() {
  if (!emptyEl) return;
  emptyEl.hidden = cards.size > 0;
}

async function paintHeader() {
  const known = CATEGORY_BY_SLUG[slug];
  const titleEl = document.getElementById("category-title");
  const taglineEl = document.getElementById("category-tagline");
  const blurbEl = document.getElementById("category-blurb");
  if (!titleEl) return;

  let meta = known;
  if (!known) {
    const remote = await fetchCategories("art");
    meta = remote.find(c => c.slug === slug);
  }
  const label = meta?.label || meta?.name || slug.replace(/-/g, " ");

  // Google renders the page before reading its title, so whatever is set here
  // is what it indexes — a hand-written title in the HTML counts for nothing
  // if this overwrites it a moment later. The seven built-in collections have
  // titles written for search and keep them; only a collection created in the
  // admin, which has no static page of its own, gets one built here. Either
  // way the artist's name is in it, because that is what people search for.
  const config = currentConfig();
  const artist = (config.home?.artistName || "Alafi Jonathan").trim();
  const brand = (config.branding?.siteTitle || "Alafi Art Work").trim();
  if (!CATEGORY_BY_SLUG[slug]) {
    document.title = `${label} by ${artist} | ${brand}`;
  }

  titleEl.textContent = label;
  if (taglineEl) taglineEl.textContent = meta?.tagline || "";
  if (blurbEl) blurbEl.textContent = meta?.blurb || "";
}

export function mount() {
  slug = currentCategorySlug();
  grid = document.getElementById("gallery-grid");
  emptyEl = document.getElementById("gallery-empty");
  cards = new Map();
  pageSubscriptions = [];

  initNav();
  if (!grid) return;

  paintHeader();

  localItems().forEach(item => addCard(item));
  updateEmptyState();
  observeReveals(document);

  bindGallery(grid, orderedItems);

  ensureGuestAuth().catch(() => null).then(() => {
    if (!grid) return;   // left before auth resolved
    pageSubscriptions.push(watchAuth((user) => {
      const next = isOwner(user);
      if (next === owner) return;
      owner = next;
      document.body.classList.toggle("is-owner", owner);
    }));
  });

  // In preview the owner may also read drafts, so unpublished pieces show up
  // alongside the live ones — which is the point of previewing before
  // publishing an upload.
  pageSubscriptions.push(watchGalleryPieces(slug, sync, () => {
    if (emptyEl) emptyEl.hidden = cards.size > 0;
  }, { includeDrafts: isPreview() }));
}

/**
 * Every card holds two Firestore listeners of its own — a like counter and a
 * comment thread — on top of the page's own subscriptions. Twenty pieces is
 * forty listeners, and leaving them behind on each navigation would have the
 * site quietly reading the database for every collection ever visited.
 */
export function unmount() {
  cards.forEach((_, id) => removeCard(id));
  cards.clear();
  pageSubscriptions.forEach((stop) => { try { stop?.(); } catch { /* already gone */ } });
  pageSubscriptions = [];
  grid = null;
  emptyEl = null;
}

export function onConfig() {
  observeReveals(document);
}
