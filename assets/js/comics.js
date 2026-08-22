import { ensureGuestAuth, watchAuth, isOwner } from "../../firebase-config.js";
import {
  watchCategories, watchComics, watchLikes, toggleLike, hasLiked,
  watchComments, addComment, deleteComment
} from "./data.js";
import { DEFAULT_COMIC_CATEGORIES } from "./site-data.js";
import { observeReveals, initNav } from "./reveal.js";

const shelvesHost = document.getElementById("comic-shelves");
const emptyHost = document.getElementById("comics-empty");
const filterHost = document.getElementById("comic-filters");

const LOCAL_STORY = {
  id: "local-sketchbook",
  title: "From the Sketchbook",
  categorySlug: "drama",
  description: "Three loose pages pulled straight from the working sketchbook — the archive sample that ships with the site.",
  coverUrl: "artworks/comics/comic1.jpg",
  pages: ["artworks/comics/comic1.jpg", "artworks/comics/comic2.jpg", "artworks/comics/comic3.jpg"],
  likes: 0,
  order: 0,
  local: true
};

let categories = DEFAULT_COMIC_CATEGORIES.map((c, i) => ({ ...c, name: c.label, order: i }));
let comics = [LOCAL_STORY];
let activeFilter = "all";
let owner = false;

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

/* ------------------------------------------------------------------ */
/*  Reader                                                             */
/* ------------------------------------------------------------------ */

const reader = {
  el: null, story: null, page: 0, unsubscribers: [], lastFocus: null
};

function buildReader() {
  if (reader.el) return reader.el;

  const el = document.createElement("div");
  el.className = "reader";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.hidden = true;
  el.innerHTML = `
    <header class="reader-bar">
      <button class="reader-exit" type="button">&#8592; <span>Back to stories</span></button>
      <div class="reader-id">
        <strong class="reader-title"></strong>
        <span class="reader-genre"></span>
      </div>
      <div class="reader-counter">
        Page <b class="reader-page">1</b> of <span class="reader-total">1</span>
      </div>
    </header>

    <div class="reader-stage">
      <button class="reader-nav reader-prev" type="button" aria-label="Previous page">&#10094;</button>
      <div class="reader-pages"></div>
      <button class="reader-nav reader-next" type="button" aria-label="Next page">&#10095;</button>
    </div>

    <footer class="reader-foot">
      <div class="reader-progress"><span class="reader-progress-fill"></span></div>
      <div class="reader-thumbs"></div>
      <div class="reader-social">
        <button class="like-btn reader-like" type="button">
          <span class="heart" aria-hidden="true">&#9825;</span> <span class="like-count">0</span>
        </button>
        <button class="comment-toggle reader-comments-toggle" type="button" aria-expanded="false">
          Discussion <span class="comment-count"></span>
        </button>
      </div>
      <div class="reader-comments" hidden>
        <div class="comments-list"></div>
        <form class="comment-form">
          <input type="text" class="comment-name" placeholder="Your name (optional)" maxlength="40">
          <textarea class="comment-text" placeholder="Thoughts on this story…" maxlength="300" required></textarea>
          <button type="submit" class="link-btn">Post</button>
        </form>
      </div>
    </footer>
  `;
  document.body.appendChild(el);

  el.querySelector(".reader-exit").addEventListener("click", closeReader);
  el.querySelector(".reader-prev").addEventListener("click", () => turn(-1));
  el.querySelector(".reader-next").addEventListener("click", () => turn(1));

  el.querySelector(".reader-thumbs").addEventListener("click", (e) => {
    const thumb = e.target.closest("[data-page]");
    if (thumb) goTo(Number(thumb.dataset.page));
  });

  el.querySelector(".reader-comments-toggle").addEventListener("click", () => {
    const panel = el.querySelector(".reader-comments");
    const opening = panel.hidden;
    panel.hidden = !opening;
    el.querySelector(".reader-comments-toggle").setAttribute("aria-expanded", String(opening));
  });

  el.querySelector(".comment-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!reader.story || reader.story.local) return;
    const text = e.target.querySelector(".comment-text");
    if (!text.value.trim()) return;
    const submit = e.target.querySelector("button[type=submit]");
    submit.disabled = true;
    try {
      await addComment("comics", reader.story.id, e.target.querySelector(".comment-name").value, text.value);
      text.value = "";
    } catch (err) {
      console.error("Comment failed:", err);
    } finally {
      submit.disabled = false;
    }
  });

  el.querySelector(".comments-list").addEventListener("click", async (e) => {
    const btn = e.target.closest(".comment-del");
    if (!btn || !reader.story) return;
    if (!confirm("Delete this comment?")) return;
    try { await deleteComment("comics", reader.story.id, btn.closest(".comment").dataset.commentId); }
    catch (err) { console.error(err); }
  });

  el.querySelector(".reader-like").addEventListener("click", async () => {
    if (!reader.story || reader.story.local) return;
    const btn = el.querySelector(".reader-like");
    btn.disabled = true;
    try {
      const ok = await toggleLike("comics", reader.story.id);
      if (ok) {
        btn.classList.add("is-liked");
        btn.querySelector(".heart").innerHTML = "&#9829;";
      } else {
        btn.disabled = false;
      }
    } catch (err) {
      console.error("Like failed:", err);
      btn.disabled = false;
    }
  });

  let startX = 0;
  const stage = el.querySelector(".reader-stage");
  stage.addEventListener("touchstart", (e) => { startX = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 55) turn(dx < 0 ? 1 : -1);
  }, { passive: true });

  reader.el = el;
  return el;
}

function onReaderKey(e) {
  if (reader.el?.hidden) return;
  if (e.target?.closest?.("input, textarea")) return;
  if (e.key === "Escape") closeReader();
  else if (e.key === "ArrowLeft") turn(-1);
  else if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); turn(1); }
  else if (e.key === "Home") goTo(0);
  else if (e.key === "End") goTo(reader.story.pages.length - 1);
}

function renderPages() {
  const host = reader.el.querySelector(".reader-pages");
  host.innerHTML = "";
  reader.story.pages.forEach((src, i) => {
    const fig = document.createElement("figure");
    fig.className = "reader-page-frame";
    fig.dataset.index = String(i);
    const img = document.createElement("img");
    img.alt = `${reader.story.title} — page ${i + 1}`;
    img.decoding = "async";
    img.draggable = false;
    // Only the current page and its neighbours are fetched; the rest load on demand.
    if (Math.abs(i - reader.page) <= 1) img.src = src;
    else img.dataset.src = src;
    fig.appendChild(img);
    host.appendChild(fig);
  });

  const thumbs = reader.el.querySelector(".reader-thumbs");
  thumbs.innerHTML = reader.story.pages.map((src, i) =>
    `<button class="reader-thumb" type="button" data-page="${i}" aria-label="Go to page ${i + 1}">
       <img src="${escapeHtml(src)}" alt="" loading="lazy"></button>`
  ).join("");

  reader.el.querySelector(".reader-total").textContent = String(reader.story.pages.length);
}

function paintPage() {
  const frames = reader.el.querySelectorAll(".reader-page-frame");
  frames.forEach((fig, i) => {
    fig.classList.toggle("is-current", i === reader.page);
    fig.classList.toggle("is-before", i < reader.page);
    fig.classList.toggle("is-after", i > reader.page);

    const img = fig.querySelector("img");
    if (Math.abs(i - reader.page) <= 1 && img.dataset.src) {
      img.src = img.dataset.src;
      delete img.dataset.src;
    }
  });

  reader.el.querySelectorAll(".reader-thumb").forEach((t, i) =>
    t.classList.toggle("is-current", i === reader.page));

  reader.el.querySelector(".reader-page").textContent = String(reader.page + 1);
  reader.el.querySelector(".reader-progress-fill").style.width =
    `${((reader.page + 1) / reader.story.pages.length) * 100}%`;

  reader.el.querySelector(".reader-prev").disabled = reader.page === 0;
  reader.el.querySelector(".reader-next").disabled = reader.page === reader.story.pages.length - 1;

  const active = reader.el.querySelector(".reader-thumb.is-current");
  active?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
}

function goTo(index) {
  if (!reader.story) return;
  const max = reader.story.pages.length - 1;
  reader.page = Math.min(max, Math.max(0, index));
  paintPage();
}

function turn(delta) {
  goTo(reader.page + delta);
}

function openReader(story) {
  if (!story.pages.length) return;
  buildReader();
  reader.story = story;
  reader.page = 0;
  reader.lastFocus = document.activeElement;

  reader.el.querySelector(".reader-title").textContent = story.title;
  reader.el.querySelector(".reader-genre").textContent =
    categories.find(c => c.slug === story.categorySlug)?.name || story.categorySlug;

  renderPages();
  paintPage();

  const likeBtn = reader.el.querySelector(".reader-like");
  const social = reader.el.querySelector(".reader-social");
  const commentsPanel = reader.el.querySelector(".reader-comments");
  social.hidden = !!story.local;
  commentsPanel.hidden = true;

  reader.unsubscribers.forEach(u => { try { u(); } catch {} });
  reader.unsubscribers = [];

  if (!story.local) {
    likeBtn.disabled = hasLiked(story.id);
    likeBtn.classList.toggle("is-liked", hasLiked(story.id));
    likeBtn.querySelector(".heart").innerHTML = hasLiked(story.id) ? "&#9829;" : "&#9825;";

    reader.unsubscribers.push(watchLikes("comics", story.id, (n) => {
      likeBtn.querySelector(".like-count").textContent = n;
    }));

    reader.unsubscribers.push(watchComments("comics", story.id, (list) => {
      reader.el.querySelector(".comment-count").textContent = list.length ? `(${list.length})` : "";
      reader.el.querySelector(".comments-list").innerHTML = list.length
        ? list.map(c => `
            <div class="comment" data-comment-id="${escapeHtml(c.id)}">
              <strong>${escapeHtml(c.name)}</strong>
              <span>${escapeHtml(c.text)}</span>
              ${owner ? '<button class="comment-del" type="button" aria-label="Delete comment">&times;</button>' : ""}
            </div>`).join("")
        : '<p class="no-comments">No thoughts on this story yet.</p>';
    }));
  }

  reader.el.hidden = false;
  requestAnimationFrame(() => reader.el.classList.add("is-open"));
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", onReaderKey);
  history.pushState({ reader: story.id }, "", `#story/${story.id}`);
  reader.el.querySelector(".reader-exit").focus();
}

function closeReader(fromPop) {
  if (!reader.el || reader.el.hidden || reader.closing) return;
  reader.closing = true;
  reader.el.classList.remove("is-open");
  document.body.style.overflow = "";
  document.removeEventListener("keydown", onReaderKey);
  reader.unsubscribers.forEach(u => { try { u(); } catch {} });
  reader.unsubscribers = [];

  setTimeout(() => { reader.el.hidden = true; reader.closing = false; }, 380);
  const story = reader.story;
  reader.story = null;
  if (!fromPop && location.hash.startsWith("#story/")) history.back();
  document.getElementById(`story-${story?.id}`)?.focus?.();
}

window.addEventListener("popstate", () => {
  if (!location.hash.startsWith("#story/")) closeReader(true);
});

/* ------------------------------------------------------------------ */
/*  Landing page — genre shelves of story cards                        */
/* ------------------------------------------------------------------ */

function storyCard(story, index) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "story-card";
  el.id = `story-${story.id}`;
  el.dataset.storyId = story.id;
  el.setAttribute("data-reveal", "scale");
  el.style.setProperty("--reveal-delay", `${(index % 4) * 90}ms`);

  el.innerHTML = `
    <span class="story-cover">
      <img src="${escapeHtml(story.coverUrl)}" alt="Cover of ${escapeHtml(story.title)}"
           loading="lazy" decoding="async" draggable="false">
      <span class="story-enter">Read story &#8594;</span>
    </span>
    <span class="story-meta">
      <strong>${escapeHtml(story.title)}</strong>
      <small>${story.pages.length} page${story.pages.length === 1 ? "" : "s"}</small>
    </span>
    ${story.description ? `<span class="story-blurb">${escapeHtml(story.description)}</span>` : ""}
  `;

  el.addEventListener("click", () => openReader(story));
  return el;
}

function visibleCategories() {
  return categories.filter(cat =>
    activeFilter === "all" ? true : cat.slug === activeFilter);
}

function renderFilters() {
  if (!filterHost) return;
  const counts = new Map();
  comics.forEach(c => counts.set(c.categorySlug, (counts.get(c.categorySlug) || 0) + 1));

  const chips = [{ slug: "all", name: "All Stories", count: comics.length }]
    .concat(categories.map(c => ({ slug: c.slug, name: c.name, count: counts.get(c.slug) || 0 })));

  filterHost.innerHTML = chips.map(c => `
    <button class="chip${c.slug === activeFilter ? " is-active" : ""}" type="button" data-filter="${escapeHtml(c.slug)}">
      ${escapeHtml(c.name)} <i>${c.count}</i>
    </button>`).join("");
}

function renderShelves() {
  if (!shelvesHost) return;
  shelvesHost.innerHTML = "";

  const shelves = visibleCategories()
    .map(cat => ({ cat, stories: comics.filter(c => c.categorySlug === cat.slug) }))
    .filter(s => s.stories.length);

  const orphaned = comics.filter(c => !categories.some(cat => cat.slug === c.categorySlug));
  if (orphaned.length && activeFilter === "all") {
    shelves.push({ cat: { slug: "uncategorised", name: "Uncategorised", tagline: "", blurb: "" }, stories: orphaned });
  }

  if (emptyHost) emptyHost.hidden = shelves.length > 0;

  shelves.forEach(({ cat, stories }, i) => {
    const section = document.createElement("section");
    section.className = "shelf";
    section.id = `genre-${cat.slug}`;
    section.innerHTML = `
      <header class="shelf-head" data-reveal="left">
        <span class="collection-index">${String(i + 1).padStart(2, "0")}</span>
        <h2>${escapeHtml(cat.name)}</h2>
        ${cat.tagline ? `<p class="collection-tagline">${escapeHtml(cat.tagline)}</p>` : ""}
        ${cat.blurb ? `<p class="shelf-blurb">${escapeHtml(cat.blurb)}</p>` : ""}
        <span class="shelf-count">${stories.length} stor${stories.length === 1 ? "y" : "ies"}</span>
      </header>
      <div class="story-rail"></div>
    `;
    const rail = section.querySelector(".story-rail");
    stories.forEach((story, n) => rail.appendChild(storyCard(story, n)));
    shelvesHost.appendChild(section);
  });

  observeReveals(shelvesHost);
}

function render() {
  renderFilters();
  renderShelves();
}

function openFromHash() {
  const match = location.hash.match(/^#story\/(.+)$/);
  if (!match) return;
  const story = comics.find(c => c.id === decodeURIComponent(match[1]));
  if (story && (!reader.story || reader.story.id !== story.id)) openReader(story);
}

async function init() {
  initNav();
  if (!shelvesHost) return;

  render();

  filterHost?.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-filter]");
    if (!chip) return;
    activeFilter = chip.dataset.filter;
    render();
  });

  await ensureGuestAuth().catch(() => null);
  watchAuth((user) => { owner = isOwner(user); });

  watchCategories("comics", (items) => {
    categories = items;
    render();
    openFromHash();
  });

  watchComics((items) => {
    comics = items.length ? items : [LOCAL_STORY];
    render();
    openFromHash();
  }, () => {
    comics = [LOCAL_STORY];
    render();
  }, { publishedOnly: true });
}

init();
