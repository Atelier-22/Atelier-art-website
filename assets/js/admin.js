import { watchAuth, isOwner, ownerLogin, ownerLogout } from "../../firebase-config.js?v=20260822b";
import {
  watchCategories, seedDefaultCategories, createCategory, updateCategory,
  reorderCategories, deleteCategory,
  watchAllArtworks, createArtwork, updateArtwork, deleteArtwork,
  archivePieceId, saveArchivePiece,
  watchComics, createComic, updateComic, deleteComic, reorderComics,
  watchAllComments, deleteComment, uploadImage,
  grantAdminClaim, watchChangeLog, logChange
} from "./data.js?v=20260822b";
import { categoryHref, LOCAL_SEEDS, CATEGORY_BY_SLUG } from "./site-data.js?v=20260822b";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  artCategories: [],
  comicCategories: [],
  artworks: [],
  comics: [],
  comments: [],
  view: "overview",
  artFilter: "all",
  artSearch: "",
  archiveFilter: "",
  archiveSearch: "",
  comicFilter: "all",
  ready: false
};

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

function relativeTime(seconds) {
  if (!seconds) return "just now";
  const diff = Date.now() / 1000 - seconds;
  const units = [[31536000, "yr"], [2592000, "mo"], [604800, "wk"], [86400, "d"], [3600, "h"], [60, "m"]];
  for (const [size, label] of units) {
    if (diff >= size) return `${Math.floor(diff / size)}${label} ago`;
  }
  return "just now";
}

/* ------------------------------------------------------------------ */
/*  Toasts                                                             */
/* ------------------------------------------------------------------ */

const toastHost = document.createElement("div");
toastHost.className = "toast-host";
document.body.appendChild(toastHost);

function toast(message, kind = "") {
  const el = document.createElement("div");
  el.className = `toast ${kind ? `is-${kind}` : ""}`;
  el.textContent = message;
  toastHost.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity .3s";
    setTimeout(() => el.remove(), 320);
  }, 4200);
}

/* ------------------------------------------------------------------ */
/*  Modal — every destructive action routes through confirmDelete      */
/* ------------------------------------------------------------------ */

function modal({ title, body, confirmLabel = "Confirm", danger = false, onConfirm, confirmPhrase }) {
  const overlay = document.createElement("div");
  overlay.className = "modal";
  overlay.innerHTML = `
    <div class="modal-box" role="dialog" aria-modal="true">
      <h3>${escapeHtml(title)}</h3>
      <div class="modal-sub">${body}</div>
      ${confirmPhrase ? `
        <div class="confirm-guard">
          <p>This can't be undone. Type <code>${escapeHtml(confirmPhrase)}</code> to confirm.</p>
          <input type="text" class="guard-input" autocomplete="off" placeholder="${escapeHtml(confirmPhrase)}">
        </div>` : ""}
      <div class="modal-actions">
        <button class="btn" data-cancel>Cancel</button>
        <button class="btn ${danger ? "is-danger" : "is-primary"}" data-confirm ${confirmPhrase ? "disabled" : ""}>
          ${escapeHtml(confirmLabel)}
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("is-open"));

  const confirmBtn = $("[data-confirm]", overlay);
  const guard = $(".guard-input", overlay);

  if (guard) {
    guard.addEventListener("input", () => {
      confirmBtn.disabled = guard.value.trim() !== confirmPhrase;
    });
    guard.focus();
  } else {
    confirmBtn.focus();
  }

  function close() {
    overlay.classList.remove("is-open");
    document.removeEventListener("keydown", onKey);
    setTimeout(() => overlay.remove(), 320);
  }

  function onKey(e) { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", onKey);

  $("[data-cancel]", overlay).addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  confirmBtn.addEventListener("click", async () => {
    confirmBtn.disabled = true;
    try {
      await onConfirm();
      close();
    } catch (err) {
      console.error(err);
      toast(err.message || "That didn't work.", "error");
      confirmBtn.disabled = false;
    }
  });

  return { close, overlay };
}

function confirmDelete({ what, name, extra = "", onConfirm }) {
  return modal({
    title: `Delete this ${what}?`,
    body: `<b>${escapeHtml(name)}</b> will be permanently removed from the site.${extra ? ` ${extra}` : ""}`,
    confirmLabel: `Delete ${what}`,
    danger: true,
    confirmPhrase: "DELETE",
    onConfirm
  });
}

/* ------------------------------------------------------------------ */
/*  Auth                                                               */
/* ------------------------------------------------------------------ */

const loginScreen = $("#login-screen");
const shell = $("#admin-shell");

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#login-error");
  err.hidden = true;
  try {
    await ownerLogin($("#login-email").value.trim(), $("#login-pass").value);
  } catch {
    err.textContent = "That email and password combination wasn't accepted.";
    err.hidden = false;
    $("#login-pass").value = "";
  }
});

$("#logout").addEventListener("click", () => ownerLogout());

watchAuth((user) => {
  if (isOwner(user)) {
    loginScreen.hidden = true;
    shell.hidden = false;
    $("#who").textContent = user.email;
    paintIdentity(user).catch(err => console.warn("Identity panel failed:", err));
    if (!state.ready) { state.ready = true; boot(); }
  } else {
    loginScreen.hidden = false;
    shell.hidden = true;
  }
});

/* ------------------------------------------------------------------ */
/*  Navigation                                                         */
/* ------------------------------------------------------------------ */

$$(".admin-menu button").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.view = btn.dataset.view;
    $$(".admin-menu button").forEach(b => b.classList.toggle("is-active", b === btn));
    $$(".admin-view").forEach(v => v.classList.toggle("is-active", v.id === `view-${state.view}`));
    $("#view-title").textContent = btn.dataset.title;
    $("#view-sub").textContent = btn.dataset.sub;
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

/* ------------------------------------------------------------------ */
/*  Overview                                                           */
/* ------------------------------------------------------------------ */

function renderOverview() {
  const uploaded = state.artworks.filter(a => a.uploaded);
  const totalLikes = state.artworks.reduce((n, a) => n + a.likes, 0)
    + state.comics.reduce((n, c) => n + c.likes, 0);
  const totalPages = state.comics.reduce((n, c) => n + c.pages.length, 0);

  $("#stat-artworks").textContent = uploaded.length;
  $("#stat-comics").textContent = state.comics.length;
  $("#stat-pages").textContent = totalPages;
  $("#stat-likes").textContent = totalLikes;
  $("#stat-comments").textContent = state.comments.length;
  $("#stat-categories").textContent = state.artCategories.length + state.comicCategories.length;

  const liked = [...state.artworks.map(a => ({ ...a, kind: "Artwork", cover: a.imageUrl })),
                 ...state.comics.map(c => ({ ...c, kind: "Story", cover: c.coverUrl }))]
    .filter(x => x.likes > 0)
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 6);

  $("#top-liked").innerHTML = liked.length
    ? liked.map(x => `
        <div class="row">
          <div class="handle" style="width:44px">
            <img src="${escapeHtml(x.cover)}" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:3px">
          </div>
          <div class="row-main">
            <strong>${escapeHtml(x.title)}</strong>
            <small>${x.kind} · ${escapeHtml(x.category || x.categorySlug || "")}</small>
          </div>
          <div class="row-actions"><span class="m-badge" style="position:static">${x.likes} likes</span></div>
        </div>`).join("")
    : '<p class="empty-note">No likes recorded yet.</p>';

  const recent = [...state.artworks.filter(a => a.uploaded).map(a => ({ ...a, kind: "Artwork", cover: a.imageUrl })),
                  ...state.comics.map(c => ({ ...c, kind: "Story", cover: c.coverUrl }))]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 6);

  $("#recent-uploads").innerHTML = recent.length
    ? recent.map(x => `
        <div class="row">
          <div class="handle" style="width:44px">
            <img src="${escapeHtml(x.cover)}" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:3px">
          </div>
          <div class="row-main">
            <strong>${escapeHtml(x.title)}</strong>
            <small>${x.kind} · ${relativeTime(x.createdAt)}</small>
          </div>
        </div>`).join("")
    : '<p class="empty-note">Nothing uploaded yet.</p>';
}

/* ------------------------------------------------------------------ */
/*  Artwork upload                                                     */
/* ------------------------------------------------------------------ */

let artFiles = [];

function renderArtFiles() {
  const strip = $("#art-thumbs");
  strip.innerHTML = "";
  artFiles.forEach((file, i) => {
    const el = document.createElement("div");
    el.className = "thumb";
    el.innerHTML = `<img alt=""><button class="kill" type="button" data-i="${i}" aria-label="Remove">&times;</button>`;
    strip.appendChild(el);
    const reader = new FileReader();
    reader.onload = e => { el.querySelector("img").src = e.target.result; };
    reader.readAsDataURL(file);
  });
  $("#art-upload-btn").disabled = !artFiles.length;
  $("#art-status").textContent = artFiles.length
    ? `${artFiles.length} file${artFiles.length === 1 ? "" : "s"} ready`
    : "";
  $("#art-title-field").hidden = artFiles.length !== 1;
}

function wireDropzone(zone, input, onFiles) {
  zone.addEventListener("click", () => input.click());
  input.addEventListener("change", () => { onFiles(Array.from(input.files)); input.value = ""; });
  ["dragenter", "dragover"].forEach(ev =>
    zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add("is-dragging"); }));
  ["dragleave", "drop"].forEach(ev =>
    zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove("is-dragging"); }));
  zone.addEventListener("drop", (e) => {
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (files.length) onFiles(files);
  });
}

wireDropzone($("#art-drop"), $("#art-input"), (files) => {
  artFiles = artFiles.concat(files);
  renderArtFiles();
});

$("#art-thumbs").addEventListener("click", (e) => {
  const kill = e.target.closest(".kill");
  if (!kill) return;
  artFiles.splice(Number(kill.dataset.i), 1);
  renderArtFiles();
});

$("#art-upload-btn").addEventListener("click", async () => {
  const categorySlug = $("#art-category").value;
  if (!categorySlug) { toast("Pick a category first.", "error"); return; }

  const bar = $("#art-progress span");
  const btn = $("#art-upload-btn");
  btn.disabled = true;
  $("#art-progress").hidden = false;

  const total = artFiles.length;
  let done = 0;
  const failures = [];

  for (const file of artFiles) {
    const title = total === 1 ? ($("#art-title").value.trim() || file.name) : file.name;
    try {
      await createArtwork({
        categorySlug,
        file,
        title,
        description: total === 1 ? $("#art-desc").value.trim() : "",
        onProgress: (p) => { bar.style.width = `${((done + p) / total) * 100}%`; }
      });
    } catch (err) {
      console.error(err);
      failures.push(`${file.name}: ${err.message}`);
    }
    done++;
    $("#art-status").textContent = `Uploaded ${done} of ${total}…`;
  }

  artFiles = [];
  $("#art-title").value = "";
  $("#art-desc").value = "";
  renderArtFiles();
  $("#art-progress").hidden = true;
  bar.style.width = "0%";

  if (failures.length) {
    toast(`${failures.length} upload${failures.length === 1 ? "" : "s"} failed — see console.`, "error");
    console.warn(failures);
  } else {
    toast(`${done} artwork${done === 1 ? "" : "s"} published.`, "ok");
  }
});

/* ------------------------------------------------------------------ */
/*  Artwork management                                                 */
/* ------------------------------------------------------------------ */

function renderArtworks() {
  const host = $("#artwork-grid");
  const term = state.artSearch.toLowerCase();

  const list = state.artworks
    .filter(a => a.uploaded)
    .filter(a => state.artFilter === "all" || a.category === state.artFilter)
    .filter(a => !term || a.title.toLowerCase().includes(term))
    .sort((a, b) => b.createdAt - a.createdAt);

  $("#artwork-count").textContent = `${list.length} shown`;

  host.innerHTML = list.length ? "" : '<p class="empty-note">Nothing here. Upload something, or clear the filters.</p>';

  list.forEach((art) => {
    const el = document.createElement("article");
    el.className = "m-card";
    el.innerHTML = `
      <span class="m-badge">${art.likes} &#9829;</span>
      <img src="${escapeHtml(art.imageUrl)}" alt="${escapeHtml(art.title)}" loading="lazy">
      <div class="m-card-body">
        <h4>${escapeHtml(art.title)}</h4>
        <p>${escapeHtml(categoryName("art", art.category))}</p>
      </div>
      <div class="m-card-actions">
        <button class="btn is-small" data-edit>Edit</button>
        <button class="btn is-small is-danger" data-del>Delete</button>
      </div>
    `;

    $("[data-edit]", el).addEventListener("click", () => editArtwork(art));
    $("[data-del]", el).addEventListener("click", () => {
      confirmDelete({
        what: "artwork",
        name: art.title,
        extra: "Its likes and comments go with it.",
        onConfirm: async () => {
          await deleteArtwork(art.id);
          toast("Artwork deleted.", "ok");
        }
      });
    });

    host.appendChild(el);
  });
}

function editArtwork(art) {
  modal({
    title: "Edit artwork",
    body: `
      <div class="field">
        <label for="ea-title">Title</label>
        <input id="ea-title" type="text" value="${escapeHtml(art.title)}">
      </div>
      <div class="field">
        <label for="ea-cat">Category</label>
        <select id="ea-cat">${categoryOptions("art", art.category)}</select>
      </div>
      <div class="field">
        <label for="ea-desc">Description</label>
        <textarea id="ea-desc">${escapeHtml(art.description)}</textarea>
      </div>
    `,
    confirmLabel: "Save changes",
    onConfirm: async () => {
      await updateArtwork(art.id, {
        title: $("#ea-title").value.trim() || art.title,
        category: $("#ea-cat").value,
        description: $("#ea-desc").value.trim()
      });
      toast("Artwork updated.", "ok");
    }
  });
}

$("#artwork-search").addEventListener("input", (e) => {
  state.artSearch = e.target.value;
  renderArtworks();
});

$("#artwork-filter").addEventListener("change", (e) => {
  state.artFilter = e.target.value;
  renderArtworks();
});

/* ------------------------------------------------------------------ */
/*  Archive pieces — the images that ship with the site                */
/*                                                                     */
/*  These have never had a record of their own, so the gallery could   */
/*  only label them by position: "Portrait No. 03". Naming one writes  */
/*  a document at the same id the piece's likes already use, so a      */
/*  title, a meaning, a like count and a comment thread all live       */
/*  together and the page picks the name up immediately.               */
/* ------------------------------------------------------------------ */

/** Categories that actually ship images, in site order. */
function archiveCategories() {
  return Object.keys(LOCAL_SEEDS)
    .filter(slug => (LOCAL_SEEDS[slug] || []).length && !CATEGORY_BY_SLUG[slug]?.isComics);
}

/** The placeholder the gallery shows for an unnamed piece. */
function archivePlaceholder(slug, i) {
  const label = CATEGORY_BY_SLUG[slug]?.label || slug;
  return `${label.replace(/s$/, "")} No. ${String(i + 1).padStart(2, "0")}`;
}

function archivePieces(slug) {
  return (LOCAL_SEEDS[slug] || []).map((src, i) => {
    const id = archivePieceId(slug, i);
    const saved = state.artworks.find(a => a.id === id);
    return {
      id, slug, index: i, imageUrl: src,
      title: saved?.hasTitle ? saved.title : "",
      placeholder: archivePlaceholder(slug, i),
      description: saved?.description || "",
      likes: saved?.likes || 0
    };
  });
}

function renderArchive() {
  const host = $("#archive-grid");
  if (!host) return;

  const slug = state.archiveFilter || archiveCategories()[0] || "";
  const term = state.archiveSearch.trim().toLowerCase();

  const list = archivePieces(slug).filter(p =>
    !term || p.title.toLowerCase().includes(term) || p.placeholder.toLowerCase().includes(term));

  const named = archivePieces(slug).filter(p => p.title).length;
  const total = (LOCAL_SEEDS[slug] || []).length;
  $("#archive-count").textContent = total ? `${named} of ${total} named` : "";

  host.innerHTML = list.length ? "" : '<p class="empty-note">Nothing matches that search.</p>';

  list.forEach((piece) => {
    const el = document.createElement("article");
    el.className = "m-card";
    el.innerHTML = `
      ${piece.likes ? `<span class="m-badge">${piece.likes} &#9829;</span>` : ""}
      <img src="${escapeHtml(piece.imageUrl)}" alt="${escapeHtml(piece.title || piece.placeholder)}" loading="lazy">
      <div class="m-card-body">
        <h4>${escapeHtml(piece.title || piece.placeholder)}</h4>
        <p>${piece.title ? "Named" : "Unnamed"}</p>
      </div>
      <div class="m-card-actions">
        <button class="btn is-small" data-name>${piece.title ? "Edit" : "Add a title"}</button>
      </div>
    `;
    $("[data-name]", el).addEventListener("click", () => nameArchivePiece(piece));
    host.appendChild(el);
  });
}

function nameArchivePiece(piece) {
  modal({
    title: piece.title ? "Edit this piece" : "Name this piece",
    body: `
      <div class="field">
        <label for="ap-title">Title</label>
        <input id="ap-title" type="text" value="${escapeHtml(piece.title)}"
               placeholder="${escapeHtml(piece.placeholder)}">
        <p class="form-note">Leave this blank and the piece goes back to showing &ldquo;${escapeHtml(piece.placeholder)}&rdquo;.</p>
      </div>
      <div class="field">
        <label for="ap-desc">What it means</label>
        <textarea id="ap-desc" placeholder="Say what this piece is about — shown under the title.">${escapeHtml(piece.description)}</textarea>
      </div>
    `,
    confirmLabel: "Save",
    onConfirm: async () => {
      await saveArchivePiece(piece.id, {
        categorySlug: piece.slug,
        title: $("#ap-title").value,
        description: $("#ap-desc").value
      });
      toast($("#ap-title").value.trim() ? "Saved — it's live on the site." : "Title cleared.", "ok");
    }
  });
}

$("#archive-filter")?.addEventListener("change", (e) => {
  state.archiveFilter = e.target.value;
  state.archiveSearch = "";
  $("#archive-search").value = "";
  renderArchive();
});

$("#archive-search")?.addEventListener("input", (e) => {
  state.archiveSearch = e.target.value;
  renderArchive();
});

/* ------------------------------------------------------------------ */
/*  Comic upload — cover + ordered page sequence                       */
/* ------------------------------------------------------------------ */

let comicCover = null;
let comicPages = [];
let editingComicId = null;

function renderComicCover() {
  const host = $("#comic-cover-thumb");
  host.innerHTML = "";
  if (!comicCover) { host.hidden = true; return; }
  host.hidden = false;
  const el = document.createElement("div");
  el.className = "thumb";
  el.innerHTML = `<img alt=""><button class="kill" type="button" aria-label="Remove cover">&times;</button>`;
  host.appendChild(el);
  el.querySelector(".kill").addEventListener("click", () => { comicCover = null; renderComicCover(); });

  if (typeof comicCover === "string") {
    el.querySelector("img").src = comicCover;
  } else {
    const reader = new FileReader();
    reader.onload = e => { el.querySelector("img").src = e.target.result; };
    reader.readAsDataURL(comicCover);
  }
}

function renderComicPages() {
  const host = $("#comic-page-thumbs");
  host.innerHTML = "";

  comicPages.forEach((page, i) => {
    const el = document.createElement("div");
    el.className = "thumb";
    el.innerHTML = `
      <img alt="">
      <span class="ord">${i + 1}</span>
      <span class="move">
        <button type="button" data-up ${i === 0 ? "disabled" : ""} aria-label="Move earlier">&#9650;</button>
        <button type="button" data-down ${i === comicPages.length - 1 ? "disabled" : ""} aria-label="Move later">&#9660;</button>
      </span>
      <button class="kill" type="button" aria-label="Remove page">&times;</button>
    `;
    host.appendChild(el);

    if (typeof page === "string") {
      el.querySelector("img").src = page;
    } else {
      const reader = new FileReader();
      reader.onload = e => { el.querySelector("img").src = e.target.result; };
      reader.readAsDataURL(page);
    }

    $("[data-up]", el).addEventListener("click", () => {
      [comicPages[i - 1], comicPages[i]] = [comicPages[i], comicPages[i - 1]];
      renderComicPages();
    });
    $("[data-down]", el).addEventListener("click", () => {
      [comicPages[i + 1], comicPages[i]] = [comicPages[i], comicPages[i + 1]];
      renderComicPages();
    });
    $(".kill", el).addEventListener("click", () => {
      comicPages.splice(i, 1);
      renderComicPages();
    });
  });

  $("#comic-page-count").textContent = comicPages.length
    ? `${comicPages.length} page${comicPages.length === 1 ? "" : "s"} — they'll read in this order`
    : "";
  $("#comic-save").disabled = !comicPages.length;
}

wireDropzone($("#comic-cover-drop"), $("#comic-cover-input"), (files) => {
  comicCover = files[0];
  renderComicCover();
});

wireDropzone($("#comic-pages-drop"), $("#comic-pages-input"), (files) => {
  const sorted = files.slice().sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  comicPages = comicPages.concat(sorted);
  renderComicPages();
});

function resetComicForm() {
  editingComicId = null;
  comicCover = null;
  comicPages = [];
  $("#comic-title").value = "";
  $("#comic-desc").value = "";
  $("#comic-form-title").textContent = "Publish a story";
  $("#comic-save").textContent = "Publish story";
  $("#comic-cancel").hidden = true;
  renderComicCover();
  renderComicPages();
}

$("#comic-cancel").addEventListener("click", resetComicForm);

$("#comic-save").addEventListener("click", async () => {
  const title = $("#comic-title").value.trim();
  const categorySlug = $("#comic-category").value;
  if (!title) { toast("Give the story a title.", "error"); return; }
  if (!categorySlug) { toast("Pick a genre.", "error"); return; }
  if (!comicPages.length) { toast("A story needs at least one page.", "error"); return; }

  const btn = $("#comic-save");
  btn.disabled = true;
  $("#comic-progress").hidden = false;
  const bar = $("#comic-progress span");

  const jobs = comicPages.filter(p => typeof p !== "string").length
    + (comicCover && typeof comicCover !== "string" ? 1 : 0);
  let doneJobs = 0;
  const tick = (p) => { bar.style.width = `${((doneJobs + p) / Math.max(jobs, 1)) * 100}%`; };

  try {
    $("#comic-status").textContent = "Uploading pages…";
    const pageUrls = [];
    for (const page of comicPages) {
      if (typeof page === "string") { pageUrls.push(page); continue; }
      pageUrls.push(await uploadImage(page, tick));
      doneJobs++;
    }

    let coverUrl = typeof comicCover === "string" ? comicCover : "";
    if (comicCover && typeof comicCover !== "string") {
      $("#comic-status").textContent = "Uploading cover…";
      coverUrl = await uploadImage(comicCover, tick);
      doneJobs++;
    }

    if (editingComicId) {
      await updateComic(editingComicId, {
        title,
        categorySlug,
        description: $("#comic-desc").value.trim(),
        coverUrl: coverUrl || pageUrls[0],
        pages: pageUrls
      });
      toast("Story updated.", "ok");
    } else {
      await createComic({
        title,
        categorySlug,
        description: $("#comic-desc").value.trim(),
        coverUrl: coverUrl || pageUrls[0],
        pages: pageUrls
      });
      toast("Story published.", "ok");
    }
    resetComicForm();
  } catch (err) {
    console.error(err);
    toast(err.message || "Publishing failed.", "error");
  } finally {
    btn.disabled = false;
    $("#comic-progress").hidden = true;
    bar.style.width = "0%";
    $("#comic-status").textContent = "";
  }
});

function loadComicIntoForm(comic) {
  editingComicId = comic.id;
  comicCover = comic.coverUrl || null;
  comicPages = comic.pages.slice();
  $("#comic-title").value = comic.title;
  $("#comic-desc").value = comic.description;
  $("#comic-category").value = comic.categorySlug;
  $("#comic-form-title").textContent = `Editing “${comic.title}”`;
  $("#comic-save").textContent = "Save changes";
  $("#comic-cancel").hidden = false;
  renderComicCover();
  renderComicPages();
  $("#comic-form").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderComics() {
  const host = $("#comic-grid");
  const list = state.comics
    .filter(c => state.comicFilter === "all" || c.categorySlug === state.comicFilter);

  $("#comic-count").textContent = `${list.length} shown`;
  host.innerHTML = list.length ? "" : '<p class="empty-note">No stories yet. Publish one above.</p>';

  list.forEach((comic, i) => {
    const el = document.createElement("article");
    el.className = "m-card is-story";
    el.innerHTML = `
      <span class="m-badge">${comic.pages.length}p · ${comic.likes} &#9829;</span>
      <img class="m-cover" src="${escapeHtml(comic.coverUrl)}" alt="${escapeHtml(comic.title)}" loading="lazy">
      <div class="m-card-body">
        <h4>${escapeHtml(comic.title)}</h4>
        <p>${escapeHtml(categoryName("comics", comic.categorySlug))}</p>
      </div>
      <div class="m-card-actions">
        <button class="btn is-small" data-edit>Edit</button>
        <button class="btn is-small" data-up ${i === 0 ? "disabled" : ""}>&#9650;</button>
        <button class="btn is-small" data-down ${i === list.length - 1 ? "disabled" : ""}>&#9660;</button>
        <button class="btn is-small is-danger" data-del>Delete</button>
      </div>
    `;

    $("[data-edit]", el).addEventListener("click", () => loadComicIntoForm(comic));

    $("[data-up]", el).addEventListener("click", async () => {
      const ids = list.map(c => c.id);
      [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
      await reorderComics(ids);
    });

    $("[data-down]", el).addEventListener("click", async () => {
      const ids = list.map(c => c.id);
      [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]];
      await reorderComics(ids);
    });

    $("[data-del]", el).addEventListener("click", () => {
      confirmDelete({
        what: "story",
        name: comic.title,
        extra: `All ${comic.pages.length} pages, likes, and comments go with it.`,
        onConfirm: async () => {
          await deleteComic(comic.id);
          if (editingComicId === comic.id) resetComicForm();
          toast("Story deleted.", "ok");
        }
      });
    });

    host.appendChild(el);
  });
}

$("#comic-filter").addEventListener("change", (e) => {
  state.comicFilter = e.target.value;
  renderComics();
});

/* ------------------------------------------------------------------ */
/*  Categories — art and comics managed independently                  */
/* ------------------------------------------------------------------ */

function categoryList(kind) {
  return kind === "comics" ? state.comicCategories : state.artCategories;
}

function categoryName(kind, slug) {
  return categoryList(kind).find(c => c.slug === slug)?.name || slug || "Uncategorised";
}

function categoryOptions(kind, selected) {
  return categoryList(kind)
    .map(c => `<option value="${escapeHtml(c.slug)}"${c.slug === selected ? " selected" : ""}>${escapeHtml(c.name)}</option>`)
    .join("");
}

function usageCount(kind, slug) {
  return kind === "comics"
    ? state.comics.filter(c => c.categorySlug === slug).length
    : state.artworks.filter(a => a.uploaded && a.category === slug).length;
}

function renderCategoryList(kind) {
  const host = $(kind === "comics" ? "#comic-cat-rows" : "#art-cat-rows");
  const list = categoryList(kind);

  host.innerHTML = list.length ? "" : '<p class="empty-note">No categories yet.</p>';

  list.forEach((cat, i) => {
    const used = usageCount(kind, cat.slug);
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div class="handle">
        <button type="button" data-up ${i === 0 ? "disabled" : ""} aria-label="Move up">&#9650;</button>
        <button type="button" data-down ${i === list.length - 1 ? "disabled" : ""} aria-label="Move down">&#9660;</button>
      </div>
      <div class="row-main">
        <strong>${escapeHtml(cat.name)}</strong>
        <small>/${escapeHtml(cat.slug)} · ${used} item${used === 1 ? "" : "s"}</small>
      </div>
      <div class="row-actions">
        ${kind === "art" ? `<a class="btn is-small" href="${escapeHtml(categoryHref({ slug: cat.slug }))}" target="_blank" rel="noopener">View</a>` : ""}
        <button class="btn is-small" data-rename>Rename</button>
        <button class="btn is-small is-danger" data-del>Delete</button>
      </div>
    `;

    $("[data-up]", row).addEventListener("click", async () => {
      const ids = list.map(c => c.id);
      [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
      await ensureSeeded(kind);
      await reorderCategories(kind, ids);
    });

    $("[data-down]", row).addEventListener("click", async () => {
      const ids = list.map(c => c.id);
      [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]];
      await ensureSeeded(kind);
      await reorderCategories(kind, ids);
    });

    $("[data-rename]", row).addEventListener("click", () => {
      const main = $(".row-main", row);
      const original = main.innerHTML;
      main.innerHTML = `<input type="text" value="${escapeHtml(cat.name)}">`;
      const input = $("input", main);
      input.focus();
      input.select();

      const commit = async () => {
        const name = input.value.trim();
        if (!name || name === cat.name) { main.innerHTML = original; return; }
        try {
          await ensureSeeded(kind);
          await updateCategory(kind, cat.id, { name });
          toast("Category renamed.", "ok");
        } catch (err) {
          toast(err.message, "error");
          main.innerHTML = original;
        }
      };

      input.addEventListener("blur", commit, { once: true });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") input.blur();
        if (e.key === "Escape") { input.removeEventListener("blur", commit); main.innerHTML = original; }
      });
    });

    $("[data-del]", row).addEventListener("click", () => {
      const noun = kind === "comics" ? "stories" : "artworks";
      confirmDelete({
        what: "category",
        name: cat.name,
        extra: used
          ? `<br><br><b style="color:var(--danger)">${used} ${noun}</b> are still assigned to it. They won't be deleted, but they'll stop appearing until you reassign them.`
          : "",
        onConfirm: async () => {
          await ensureSeeded(kind);
          await deleteCategory(kind, cat.id);
          toast("Category deleted.", "ok");
        }
      });
    });

    host.appendChild(row);
  });
}

/**
 * Categories start as in-code defaults so public pages work with an empty
 * database. The first edit writes the whole default set to Firestore, after
 * which the admin panel is the source of truth.
 */
async function ensureSeeded(kind) {
  await seedDefaultCategories(kind);
}

function wireCategoryCreate(kind, formId, inputId) {
  $(formId).addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $(inputId);
    const name = input.value.trim();
    if (!name) return;
    try {
      await ensureSeeded(kind);
      await createCategory(kind, name);
      input.value = "";
      toast(`Created "${name}".`, "ok");
    } catch (err) {
      toast(err.message, "error");
    }
  });
}

wireCategoryCreate("art", "#art-cat-form", "#art-cat-name");
wireCategoryCreate("comics", "#comic-cat-form", "#comic-cat-name");

function refreshCategorySelects() {
  const art = $("#art-category");
  const artFilter = $("#artwork-filter");
  const comic = $("#comic-category");
  const comicFilter = $("#comic-filter");

  const keep = (el, html) => { const v = el.value; el.innerHTML = html; el.value = v || el.options[0]?.value; };

  keep(art, categoryOptions("art"));
  keep(comic, categoryOptions("comics"));
  keep(artFilter, `<option value="all">All categories</option>${categoryOptions("art")}`);
  keep(comicFilter, `<option value="all">All genres</option>${categoryOptions("comics")}`);

  // The archive list is per-category on purpose: twenty pieces at a time is a
  // sitting you can finish, where a hundred and twenty is a chore nobody
  // starts. Its options come from the shipped folders, not from Firestore,
  // because a category with no bundled images has nothing to name.
  const archiveFilter = $("#archive-filter");
  if (archiveFilter) {
    const slugs = archiveCategories();
    if (!state.archiveFilter) state.archiveFilter = slugs[0] || "";
    archiveFilter.innerHTML = slugs
      .map(s => `<option value="${s}">${escapeHtml(CATEGORY_BY_SLUG[s]?.label || s)}</option>`)
      .join("");
    archiveFilter.value = state.archiveFilter;
  }
}

/* ------------------------------------------------------------------ */
/*  Engagement                                                         */
/* ------------------------------------------------------------------ */

function renderComments() {
  const host = $("#comment-rows");
  $("#comment-total").textContent = state.comments.length;

  host.innerHTML = state.comments.length ? "" : '<p class="empty-note">No comments yet.</p>';

  state.comments.forEach((c) => {
    const source = c.parentCollection === "comics"
      ? state.comics.find(x => x.id === c.parentId)?.title
      : state.artworks.find(x => x.id === c.parentId)?.title;

    const row = document.createElement("div");
    row.className = "row row-comment";
    row.innerHTML = `
      <div class="row-main">
        <strong>${escapeHtml(c.name)}</strong>
        <small>on ${escapeHtml(source || c.parentId)} · ${relativeTime(c.createdAt / 1000)}</small>
        <span>${escapeHtml(c.text)}</span>
      </div>
      <div class="row-actions">
        <button class="btn is-small is-danger" data-del>Delete</button>
      </div>
    `;

    $("[data-del]", row).addEventListener("click", () => {
      confirmDelete({
        what: "comment",
        name: `${c.name}: “${c.text.slice(0, 60)}${c.text.length > 60 ? "…" : ""}”`,
        onConfirm: async () => {
          await deleteComment(c.parentCollection, c.parentId, c.id);
          toast("Comment deleted.", "ok");
        }
      });
    });

    host.appendChild(row);
  });
}


/* ------------------------------------------------------------------ */
/*  Maintenance — identity, migration, change log                      */
/* ------------------------------------------------------------------ */

async function paintIdentity(user) {
  $("#admin-uid").textContent = user.uid || "unavailable";
  const stateEl = $("#admin-claim-state");

  let claimed = false;
  try {
    const token = await user.getIdTokenResult?.(true);
    claimed = token?.claims?.admin === true;
  } catch (err) {
    console.warn("Could not read the ID token claims:", err);
  }

  stateEl.textContent = claimed
    ? "Granted — rules are matching on your UID claim"
    : "Not granted — rules are falling back to your email";
  stateEl.style.color = claimed ? "var(--ok)" : "var(--gold)";
  $("#grant-claim").disabled = claimed;
}

$("#copy-uid").addEventListener("click", async () => {
  const uid = $("#admin-uid").textContent;
  try {
    await navigator.clipboard.writeText(uid);
    toast("UID copied.", "ok");
  } catch {
    toast(uid, "");
  }
});

$("#grant-claim").addEventListener("click", async () => {
  const btn = $("#grant-claim");
  btn.disabled = true;
  try {
    const res = await grantAdminClaim();
    toast(`Claim granted to ${res.email}. Sign out and back in to activate it.`, "ok");
    await logChange("admin.claimGranted", res.uid, res.email);
  } catch (err) {
    console.error(err);
    toast(
      /not-found|internal|unavailable/i.test(err.message)
        ? "Cloud Functions are not deployed yet — see functions/README.md."
        : err.message,
      "error"
    );
    btn.disabled = false;
  }
});

function renderMigrationReport(plans, applied) {
  const host = $("#migrate-report");
  host.innerHTML = plans.map(p => `
    <div class="row">
      <div class="row-main">
        <strong>${escapeHtml(p.label)}</strong>
        <small>${applied
          ? `${p.written} document${p.written === 1 ? "" : "s"} written`
          : `${p.writes.length} document${p.writes.length === 1 ? "" : "s"} would change`}</small>
        ${(p.notes || []).map(n => `<span style="display:block;color:var(--paper-faint);font-size:.76rem">${escapeHtml(n)}</span>`).join("")}
      </div>
    </div>
  `).join("");
}

$("#migrate-dry").addEventListener("click", async () => {
  const btn = $("#migrate-dry");
  btn.disabled = true;
  $("#migrate-report").innerHTML = '<p class="empty-note">Scanning…</p>';
  try {
    const { dryRun } = await import("./migrate.js?v=20260822b");
    const { plans, totalWrites } = await dryRun();
    renderMigrationReport(plans, false);
    $("#migrate-run").disabled = totalWrites === 0;
    toast(totalWrites
      ? `${totalWrites} documents need migrating.`
      : "Nothing to migrate — schema is already current.", "ok");
  } catch (err) {
    console.error(err);
    $("#migrate-report").innerHTML = `<p class="empty-note">Scan failed: ${escapeHtml(err.message)}</p>`;
    toast("Could not scan. Check the console.", "error");
  } finally {
    btn.disabled = false;
  }
});

$("#migrate-run").addEventListener("click", () => {
  modal({
    title: "Run the schema migration?",
    body: "This writes <b>status</b>, <b>featured</b>, and Cloudinary <b>public IDs</b> onto your existing documents, copies categories into artCategories, seeds comic genres, and backfills the media library.<br><br>It is additive and idempotent — nothing is deleted, and re-running it is harmless.",
    confirmLabel: "Run migration",
    onConfirm: async () => {
      const { apply } = await import("./migrate.js?v=20260822b");
      const { results, totalWrites } = await apply((label) => {
        $("#migrate-report").innerHTML = `<p class="empty-note">Migrating: ${escapeHtml(label)}…</p>`;
      });
      renderMigrationReport(results, true);
      $("#migrate-run").disabled = true;
      toast(`Migration complete — ${totalWrites} documents written.`, "ok");
    }
  });
});

function renderChangeLog(entries) {
  const host = $("#changelog-rows");
  host.innerHTML = entries.length ? entries.map(e => `
    <div class="row row-comment">
      <div class="row-main">
        <strong>${escapeHtml(e.action)}</strong>
        <small>${escapeHtml(e.actor || "")} &middot; ${relativeTime(e.createdAt / 1000)}</small>
        <span>${escapeHtml(e.resource || "")}${e.detail ? " — " + escapeHtml(e.detail) : ""}</span>
      </div>
    </div>
  `).join("") : '<p class="empty-note">No changes recorded yet.</p>';
}

/* ------------------------------------------------------------------ */
/*  Boot                                                               */
/* ------------------------------------------------------------------ */

function boot() {
  // The archive list is driven by the bundled folders, not by Firestore, so
  // it can be drawn immediately rather than waiting for a snapshot.
  refreshCategorySelects();
  renderArchive();

  watchCategories("art", (items) => {
    state.artCategories = items;
    refreshCategorySelects();
    renderCategoryList("art");
    renderArtworks();
    renderArchive();
    renderOverview();
  });

  watchCategories("comics", (items) => {
    state.comicCategories = items;
    refreshCategorySelects();
    renderCategoryList("comics");
    renderComics();
    renderOverview();
  });

  watchAllArtworks((items) => {
    state.artworks = items;
    renderArtworks();
    renderArchive();
    renderCategoryList("art");
    renderOverview();
  });

  watchComics((items) => {
    state.comics = items;
    renderComics();
    renderCategoryList("comics");
    renderOverview();
  });

  watchAllComments((items) => {
    state.comments = items;
    renderComments();
    renderOverview();
  }, () => {
    $("#comment-rows").innerHTML =
      '<p class="empty-note">Comments couldn\'t be loaded. Publish the collection-group rule from firestore.rules in the Firebase Console.</p>';
  });

  watchChangeLog(renderChangeLog, () => {
    $("#changelog-rows").innerHTML = '<p class="empty-note">Change log unavailable — publish the updated rules.</p>';
  });

  renderArtFiles();
  renderComicPages();
  renderComicCover();
}
