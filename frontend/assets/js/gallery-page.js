import { ensureGuestAuth, watchAuth, isOwner } from "../../firebase-config.js?v=20261031a";
import {
  watchArtworks, watchLikes, toggleLike, hasLiked,
  watchComments, addComment, deleteComment, watchCategories
} from "./data.js?v=20261031a";
import { currentConfig } from "./site-config.js?v=20261031a";
import { currentCategorySlug } from "./site-data.js?v=20261031a";
import { bindGallery } from "./lightbox.js?v=20261031a";
import { observeReveals, initNav } from "./reveal.js?v=20261031a";
import { modal } from "./admin-ui.js?v=20261031a";

let slug = "";
let grid = null;
let emptyEl = null;
let category = null;
let categoriesReady = false;
let cards = new Map();
let owner = false;
let pageSubscriptions = [];

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

function orderedItems() {
  return Array.from(grid.querySelectorAll(".art-card"))
    .map(el => cards.get(el.dataset.artId))
    .filter(Boolean)
    .map(({ item }) => ({
      id: item.id,
      src: item.imageUrl,
      title: item.title,
      meta: [item.caption, item.description].filter(Boolean).join(" — ")
    }));
}

function buildCard(item) {
  const el = document.createElement("article");
  el.className = "art-card";
  el.dataset.artId = item.id;

  el.innerHTML = `
    <button class="art-frame" type="button" data-lightbox="${escapeHtml(item.id)}">
      <img alt="" loading="lazy" decoding="async" draggable="false">
      <span class="art-frame-hint">View</span>
    </button>
    <div class="art-body">
      <h3 class="art-title"></h3>
      <p class="art-caption"></p>
      <p class="art-desc"></p>
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
  img.addEventListener("error", () => console.error("Artwork image failed to load:", img.currentSrc || img.src));
  paintCard(el, item);
  return el;
}

function paintCard(el, item) {
  const img = el.querySelector("img");
  if (img.getAttribute("src") !== item.imageUrl) img.src = item.imageUrl;
  img.alt = item.title;
  el.querySelector(".art-frame").setAttribute("aria-label", item.title ? `View ${item.title} full size` : "View full size");
  const title = el.querySelector(".art-title");
  title.textContent = item.title;
  title.hidden = !item.title;
  const caption = el.querySelector(".art-caption");
  caption.textContent = item.caption;
  caption.hidden = !item.caption;
  const desc = el.querySelector(".art-desc");
  desc.textContent = item.description;
  desc.hidden = !item.description;
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
      showError(el, `Couldn't save your like: ${err.message}`);
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
    modal({
      title: "Delete 1 item permanently?",
      body: "This comment will be permanently deleted. This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        try { await deleteComment("artworks", item.id, id); }
        catch (err) { console.error(err); showError(el, `Couldn't delete that comment: ${err.message}`); throw err; }
      }
    });
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
      showError(el, `Couldn't post your comment: ${err.message}`);
    } finally {
      submit.disabled = false;
    }
  });

  return unsubscribers;
}

function removeCard(id) {
  const entry = cards.get(id);
  if (!entry) return;
  entry.unsubscribers.forEach(unsub => {
    try { unsub(); } catch (err) { console.error("Card listener could not be stopped.", err); }
  });
  entry.el.remove();
  cards.delete(id);
}

function sync(items) {
  if (!grid) return;
  const incoming = new Set(items.map(i => i.id));
  cards.forEach((_, id) => { if (!incoming.has(id)) removeCard(id); });

  items.forEach((item) => {
    const existing = cards.get(item.id);
    if (!existing) {
      const el = buildCard(item);
      el.setAttribute("data-reveal", "scale");
      cards.set(item.id, { el, item, unsubscribers: wireCard(el, item) });
      return;
    }
    existing.item = item;
    paintCard(existing.el, item);
  });

  items.forEach((item) => grid.appendChild(cards.get(item.id).el));
  observeReveals(grid);
  updateEmptyState();
}

function updateEmptyState() {
  if (!emptyEl || !grid) return;
  const missing = categoriesReady && !category;
  grid.hidden = missing;
  emptyEl.hidden = !missing && cards.size > 0;
  emptyEl.querySelector("[data-empty-missing]")?.toggleAttribute("hidden", !missing);
  emptyEl.querySelector("[data-empty-none]")?.toggleAttribute("hidden", missing);
}

function paintHeader() {
  const titleEl = document.getElementById("category-title");
  const taglineEl = document.getElementById("category-tagline");
  const blurbEl = document.getElementById("category-blurb");
  const crumb = document.getElementById("crumb-current");
  const name = category?.name || "";
  if (titleEl) { titleEl.textContent = name; titleEl.hidden = !name; }
  if (crumb) crumb.textContent = name;
  if (taglineEl) { taglineEl.textContent = category?.tagline || ""; taglineEl.hidden = !category?.tagline; }
  if (blurbEl) { blurbEl.textContent = category?.blurb || ""; blurbEl.hidden = !category?.blurb; }

  const site = currentConfig().branding.siteTitle.trim();
  const title = [name, site].filter(Boolean).join(" | ");
  if (title) document.title = title;
}

export function mount() {
  slug = currentCategorySlug();
  grid = document.getElementById("gallery-grid");
  emptyEl = document.getElementById("gallery-empty");
  cards = new Map();
  category = null;
  categoriesReady = false;
  pageSubscriptions = [];

  initNav();
  if (!grid) return;

  document.body.dataset.ownTitle = "1";
  observeReveals(document);
  bindGallery(grid, orderedItems);

  pageSubscriptions.push(watchCategories("art", (items) => {
    category = items.find(c => c.slug === slug) || null;
    categoriesReady = true;
    paintHeader();
    updateEmptyState();
  }));

  ensureGuestAuth().catch((err) => { console.error("Guest sign-in failed; likes and comments are unavailable.", err); return null; }).then(() => {
    if (!grid) return;
    pageSubscriptions.push(watchAuth((user) => {
      const next = isOwner(user);
      if (next === owner) return;
      owner = next;
      document.body.classList.toggle("is-owner", owner);
    }));
  });

  pageSubscriptions.push(slug
    ? watchArtworks(slug, sync, (err) => {
        if (emptyEl) emptyEl.hidden = false;
        console.error("Collection artworks could not be read.", err);
      })
    : () => {});
  if (!slug) { categoriesReady = true; updateEmptyState(); }
}

export function unmount() {
  cards.forEach((_, id) => removeCard(id));
  cards.clear();
  pageSubscriptions.forEach((stop) => {
    try { stop?.(); } catch (err) { console.error("Collection listener could not be stopped.", err); }
  });
  pageSubscriptions = [];
  grid = null;
  emptyEl = null;
}

export function onConfig() {
  paintHeader();
  observeReveals(document);
}
