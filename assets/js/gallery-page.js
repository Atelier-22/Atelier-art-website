import { ensureGuestAuth, watchAuth, isOwner } from "../../firebase-config.js";
import {
  watchArtworks, watchLikes, toggleLike, hasLiked,
  watchComments, addComment, deleteComment, fetchCategories
} from "./data.js";
import { LOCAL_SEEDS, CATEGORY_BY_SLUG, currentCategorySlug } from "./site-data.js";
import { bindGallery } from "./lightbox.js";
import { observeReveals, initNav } from "./reveal.js";

const slug = currentCategorySlug();
const grid = document.getElementById("gallery-grid");
const emptyEl = document.getElementById("gallery-empty");

/** artId -> { el, item, unsubscribers[] } — the live model the lightbox reads. */
const cards = new Map();
let owner = false;

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

function localItems() {
  const seeds = LOCAL_SEEDS[slug] || [];
  const label = CATEGORY_BY_SLUG[slug]?.label || slug;
  return seeds.map((src, i) => ({
    id: `${slug}-archive-${i + 1}`,
    title: `${label.replace(/s$/, "")} No. ${String(i + 1).padStart(2, "0")}`,
    imageUrl: src,
    description: "",
    archive: true
  }));
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
      ${item.description ? `<p class="art-desc">${escapeHtml(item.description)}</p>` : ""}
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

  unsubscribers.push(watchLikes("artworks", item.id, (n) => { likeCount.textContent = n; }));

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
 * Reconciles the uploaded set against what's on screen instead of tearing the
 * grid down and rebuilding it. The old renderer rebuilt every card on every
 * snapshot — and a like triggers a snapshot — which re-registered listeners
 * without unsubscribing and made cards visibly restack.
 */
function syncUploaded(items) {
  const incoming = new Set(items.map(i => i.id));

  cards.forEach((entry, id) => {
    if (!entry.item.archive && !incoming.has(id)) removeCard(id);
  });

  items.forEach((item) => {
    const existing = cards.get(item.id);
    if (!existing) {
      addCard(item);
      return;
    }
    if (existing.item.title !== item.title || existing.item.imageUrl !== item.imageUrl) {
      existing.item = item;
      existing.el.querySelector(".art-title").textContent = item.title;
      const img = existing.el.querySelector("img");
      if (img.getAttribute("src") !== item.imageUrl) img.src = item.imageUrl;
    }
  });

  // Seat the uploaded cards ahead of the local archive, newest first.
  // Prepending them one at a time would reverse the snapshot order.
  let anchor = null;
  items.forEach((item) => {
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
  document.title = `${label} | Alafi Art Work`;
  titleEl.textContent = label;
  if (taglineEl) taglineEl.textContent = meta?.tagline || "";
  if (blurbEl) blurbEl.textContent = meta?.blurb || "";
}

async function init() {
  initNav();
  if (!grid) return;

  await paintHeader();

  localItems().forEach(item => addCard(item));
  updateEmptyState();
  observeReveals(document);

  bindGallery(grid, orderedItems);

  await ensureGuestAuth().catch(() => null);
  watchAuth((user) => {
    const next = isOwner(user);
    if (next === owner) return;
    owner = next;
    document.body.classList.toggle("is-owner", owner);
  });

  watchArtworks(slug, syncUploaded, () => {
    if (emptyEl) emptyEl.hidden = cards.size > 0;
  });
}

init();
