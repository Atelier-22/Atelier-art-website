import { watchAuth, isOwner, ownerLogin, ownerLogout, ownerPasswordReset, authReady } from "../../firebase-config.js?v=20261031a";
import {
  watchCategories, createCategory, updateCategory, setCategoryCover,
  reorderCategories, deleteCategory,
  watchAllArtworks, createArtwork, updateArtwork, deleteArtwork,
  setArtworkVisibility, replaceArtworkImage, reorderArtworks, sortArtworks,
  watchComics, createComic, updateComic, deleteComic, reorderComics, setComicVisibility,
  watchAllComments, deleteComment, uploadAndRecord, destroyAsset,
  grantAdminClaim, watchChangeLog
} from "./data.js?v=20261031a";
import { categoryHref } from "./site-data.js?v=20261031a";
import {
  $, $$, escapeHtml, relativeTime, toast, modal
} from "./admin-ui.js?v=20261031a";
import {
  initSettings, setSettingsCategories, pickImage, setActiveView, hasPendingSave, flushSave
} from "./admin-settings.js?v=20261031a";
import { initPreview, setPreviewCategories, onPreviewShown } from "./admin-preview.js?v=20261031a";
import { initAdminSearch } from "./admin-search.js?v=20261031a";

const state = {
  artCategories: [],
  comicCategories: [],
  artworks: [],
  comics: [],
  comments: [],
  view: ["overview", "artworks", "comics", "categories", "settings", "preview", "maintenance", "engagement", "changelog"].includes(new URLSearchParams(location.search).get("section"))
    ? new URLSearchParams(location.search).get("section") : "overview",
  collection: "",
  collectionSearch: "",
  selectingArt: false,
  selectedArt: new Set(),
  artAnchor: null,
  selectingComics: false,
  selectedComics: new Set(),
  comicAnchor: null,
  selectingArtCats: false,
  selectedArtCats: new Set(),
  selectingComicCats: false,
  selectedComicCats: new Set(),
  selectingComments: false,
  selectedComments: new Set(),
  dashboardRestored: false,
  comicFilter: "all",
  ready: false
};
let bulkDeleteOpen = false;


const loginScreen = $("#login-screen");
const shell = $("#admin-shell");

function restoreSelectionFocus(container, selector, key) {
  const input = $$(selector, container).find(node => node.closest("[data-selection-key]")?.dataset.selectionKey === key);
  input?.focus({ preventScroll: true });
}

const DASHBOARD_STATE_KEY = "alafi-admin-dashboard-state-v2";

function saveDashboardState() {
  if (!state.dashboardRestored) return;
  try {
    sessionStorage.setItem(DASHBOARD_STATE_KEY, JSON.stringify({
      view: state.view, collection: state.collection, collectionSearch: state.collectionSearch,
      comicFilter: state.comicFilter, selectingArt: state.selectingArt, selectedArt: [...state.selectedArt],
      selectingComics: state.selectingComics, selectedComics: [...state.selectedComics],
      selectingArtCats: state.selectingArtCats, selectedArtCats: [...state.selectedArtCats],
      selectingComicCats: state.selectingComicCats, selectedComicCats: [...state.selectedComicCats],
      selectingComments: state.selectingComments, selectedComments: [...state.selectedComments], scrollY: window.scrollY
    }));
  } catch (err) { console.error("Dashboard state could not be remembered.", err); }
}

function restoreDashboardState() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(DASHBOARD_STATE_KEY) || "null");
    if (!saved) { state.dashboardRestored = true; return; }
    state.collection = saved.collection || state.collection;
    state.collectionSearch = saved.collectionSearch || "";
    state.comicFilter = saved.comicFilter || "all";
    state.selectingArt = !!saved.selectingArt;
    state.selectedArt = new Set(saved.selectedArt || []);
    state.selectingComics = !!saved.selectingComics;
    state.selectedComics = new Set(saved.selectedComics || []);
    state.selectingArtCats = !!saved.selectingArtCats;
    state.selectedArtCats = new Set(saved.selectedArtCats || []);
    state.selectingComicCats = !!saved.selectingComicCats;
    state.selectedComicCats = new Set(saved.selectedComicCats || []);
    state.selectingComments = !!saved.selectingComments;
    state.selectedComments = new Set(saved.selectedComments || []);
    $("#collection-search").value = state.collectionSearch;
    renderCollectionChips(); renderCollection(); renderComics();
    const targetY = Number(saved.scrollY) || 0;
    let attempts = 0;
    if (targetY) window.scrollTo(0, targetY);
    const restoreScroll = () => {
      if (document.documentElement.scrollHeight >= targetY + window.innerHeight || attempts++ >= 20) {
        window.scrollTo(0, targetY);
        state.dashboardRestored = true;
        saveDashboardState();
      } else setTimeout(restoreScroll, 200);
    };
    requestAnimationFrame(() => requestAnimationFrame(restoreScroll));
  } catch (err) { console.error("Dashboard state could not be restored.", err); state.dashboardRestored = true; }
}

window.addEventListener("scroll", saveDashboardState, { passive: true });
window.addEventListener("pagehide", saveDashboardState);

const LOGIN_ERRORS = {
  "auth/invalid-email": "That doesn't look like an email address.",
  "auth/user-not-found": "No owner account uses that address.",
  "auth/wrong-password": "That password isn't right for this address.",
  "auth/invalid-credential": "That email and password combination wasn't accepted.",
  "auth/invalid-login-credentials": "That email and password combination wasn't accepted.",
  "auth/owner-access-denied": "This account is not on the dashboard owner list.",
  "auth/too-many-requests": "Too many attempts from this device. Wait a few minutes and try again.",
  "auth/network-request-failed": "No connection to the server. Check the network and try again.",
  "auth/user-disabled": "That account has been disabled.",
  "auth/unauthorized-domain": "This site is not authorized to sign in with Firebase. Contact the site administrator.",
  "auth/invalid-api-key": "Firebase sign-in is misconfigured for this site. Contact the site administrator.",
  "auth/requests-to-this-api-blocked": "Firebase is blocking sign-in requests from this site. Contact the site administrator.",
  "auth/operation-not-allowed": "Email sign-in is switched off for this project."
};

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#login-error");
  const submit = $("#login-form button[type=submit]");
  err.hidden = true;
  submit.disabled = true;
  try {
    const credential = await ownerLogin($("#login-email").value, $("#login-pass").value);
    if (!isOwner(credential?.user)) {
      await ownerLogout();
      const email = credential?.user?.email || $("#login-email").value.trim();
      const error = new Error(`Signed in as ${email || "this account"}, but this email is not on the owner list.`);
      error.code = "auth/owner-access-denied";
      throw error;
    }
  } catch (error) {
    const code = error?.code || "";
    const friendly = LOGIN_ERRORS[code] || "Sign-in failed.";
    err.textContent = code === "auth/owner-access-denied"
      ? error.message
      : `${friendly} (${code || "unknown"})`;
    err.hidden = false;
    console.error(error?.code || "auth/unknown", error?.message || "Sign-in failed.");
  } finally {
    submit.disabled = false;
  }
});

$("#login-reset").addEventListener("click", async () => {
  const email = $("#login-email");
  const button = $("#login-reset");
  const status = $("#login-reset-status");
  if (!email.value.trim() || !email.checkValidity()) {
    email.reportValidity();
    email.focus();
    return;
  }
  button.disabled = true;
  status.hidden = false;
  status.classList.remove("is-error");
  status.textContent = "Sending reset link…";
  try {
    await ownerPasswordReset(email.value);
    status.textContent = "If that account exists, a reset email has been sent.";
  } catch (error) {
    const code = error?.code || "";
    status.textContent = LOGIN_ERRORS[code] || `Couldn't send a reset link (${code || error?.message || "unknown error"}).`;
    status.classList.add("is-error");
  } finally {
    button.disabled = false;
  }
});

authReady.then((mode) => {
  const note = $("#login-persistence");
  if (!note) return;
  if (mode === "memory" || mode === "session") {
    note.hidden = false;
    note.textContent = mode === "memory"
      ? "This browser won't remember the sign-in, so a refresh will sign you out. Private browsing is the usual cause — try a normal window."
      : "This browser will only remember the sign-in until the tab is closed.";
  }
});

$("#logout").addEventListener("click", async () => {
  if (hasPendingSave()) {
    try { await flushSave(); }
    catch (err) {
      console.error(err);
      toast(`Your last setting did not save: ${err.message}. Still signed in.`, "error");
      return;
    }
  }
  await ownerLogout();
});

async function hasAdminAccess(user) {
  if (!user) return false;
  if (isOwner(user)) return true;
  try {
    const token = await user.getIdTokenResult();
    return token.claims.admin === true;
  } catch (err) {
    console.error("Could not read the sign-in claims:", err);
    return false;
  }
}

watchAuth(async (user) => {
  if (await hasAdminAccess(user)) {
    loginScreen.hidden = true;
    shell.hidden = false;
    $("#who").textContent = user.email || user.uid;
    paintIdentity(user).catch(err => console.error("Identity panel failed:", err));
    if (!state.ready) {
      state.ready = true; boot();
      restoreDashboardState();
      showView(state.view, { push: false, scroll: false });
    }
  } else {
    loginScreen.hidden = false;
    shell.hidden = true;
    if (user) {
      const err = $("#login-error");
      err.textContent = `Signed in as ${user.email || "this account"}, but this email is not on the owner list.`;
      err.hidden = false;
    }
  }
});


function showView(view, { push = true, scroll = true } = {}) {
  state.view = view;
  const btn = $(`.admin-menu button[data-view="${view}"]`);
  $$(".admin-menu button").forEach(b => b.classList.toggle("is-active", b === btn));
  $$(".admin-view").forEach(v => v.classList.toggle("is-active", v.id === `view-${view}`));
  $("#view-title").textContent = btn.dataset.title;
  $("#view-sub").textContent = btn.dataset.sub;
  setActiveView(view);
  if (view === "preview") onPreviewShown();
  const url = new URL(location.href);
  url.searchParams.set("section", view);
  if (push) history.pushState({ admin: true }, "", url.href);
  else history.replaceState({ admin: true }, "", url.href);
  if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
  saveDashboardState();
}

$$(".admin-menu button").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

window.addEventListener("popstate", () => {
  const view = new URLSearchParams(location.search).get("section") || "overview";
  if ($(`.admin-menu button[data-view="${view}"]`)) showView(view, { push: false, scroll: false });
});

document.addEventListener("click", (e) => {
  const link = e.target.closest("[data-goto-view]");
  if (!link) return;
  e.preventDefault();
  showView(link.dataset.gotoView);
  const focus = link.dataset.gotoFocus;
  if (focus) setTimeout(() => $(focus)?.scrollIntoView({ behavior: "smooth", block: "center" }), 260);
});


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


let artFiles = [];
let artUploading = false;

function renderArtFiles() {
  const strip = $("#art-thumbs");
  strip.innerHTML = "";
  artFiles.forEach((file, i) => {
    const el = document.createElement("div");
    el.className = "thumb";
    el.innerHTML = `<img alt=""><button class="kill" type="button" data-i="${i}" aria-label="Remove" ${artUploading ? "disabled" : ""}>&times;</button>`;
    strip.appendChild(el);
    const reader = new FileReader();
    reader.onload = e => { el.querySelector("img").src = e.target.result; };
    reader.readAsDataURL(file);
  });
  $("#art-upload-btn").disabled = artUploading || !artFiles.length;
  $("#art-input").disabled = artUploading;
  $("#art-category").disabled = artUploading;
  $("#art-status").textContent = artUploading ? $("#art-status").textContent : artFiles.length
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
  if (artUploading) return;
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
  if (!artFiles.length || artUploading) return;
  const categorySlug = $("#art-category").value;
  if (!categorySlug) { toast("Create a collection first, then pick it here.", "error"); return; }

  const bar = $("#art-progress span");
  const btn = $("#art-upload-btn");
  artUploading = true;
  renderArtFiles();
  btn.disabled = true;
  $("#art-category").disabled = true;
  $("#art-input").disabled = true;
  $("#art-progress").hidden = false;

  const batch = artFiles.slice();
  const total = batch.length;
  let done = 0;
  const failures = [];

  for (const file of batch) {
    const title = total === 1 ? ($("#art-title").value.trim() || file.name) : file.name;
    $("#art-status").textContent = `Uploading ${done + 1} of ${total}: ${file.name}`;
    try {
      await createArtwork({
        categorySlug,
        file,
        title,
        caption: total === 1 ? $("#art-caption").value.trim() : "",
        description: total === 1 ? $("#art-desc").value.trim() : "",
        onStatus: (message) => { $("#art-status").textContent = `${file.name}: ${message}`; },
        onProgress: (p) => { bar.style.width = `${((done + p) / total) * 100}%`; }
      });
      artFiles = artFiles.filter(queued => queued !== file);
    } catch (err) {
      console.error(`Upload failed for ${file.name}:`, err);
      failures.push({ file, message: err.message || "Upload failed." });
    }
    done++;
    renderArtFiles();
  }

  artUploading = false;
  $("#art-category").disabled = false;
  $("#art-input").disabled = false;
  if (!failures.length) { $("#art-title").value = ""; $("#art-caption").value = ""; $("#art-desc").value = ""; }
  renderArtFiles();
  $("#art-progress").hidden = true;
  bar.style.width = "0%";

  if (failures.length) {
    $("#art-status").textContent = `${failures[0].file.name}: ${failures[0].message}. Still queued; retry after fixing the issue.`;
    toast(`${done - failures.length} uploaded; ${failures.length} failed: ${failures[0].message}`, "error");
  } else {
    $("#art-status").textContent = `${done} artwork${done === 1 ? "" : "s"} published.`;
    toast(`${done} artwork${done === 1 ? "" : "s"} published.`, "ok");
  }
});

function collectionSlugs() {
  const fromCategories = state.artCategories.map(c => c.slug);
  const orphaned = state.artworks
    .filter(a => a.uploaded && a.category && !fromCategories.includes(a.category))
    .map(a => a.category);
  return Array.from(new Set([...fromCategories, ...orphaned]));
}

function collectionPieces(slug) {
  return sortArtworks(state.artworks.filter(a => a.uploaded && a.category === slug))
    .map((a, position) => ({ ...a, slug, position }));
}

function activeCollection() {
  const slugs = collectionSlugs();
  if (!slugs.includes(state.collection)) state.collection = slugs[0] || "";
  return state.collection;
}

function matchesSearch(piece) {
  const term = state.collectionSearch.trim().toLowerCase();
  return !term || [piece.title, piece.caption, piece.description].some(v => (v || "").toLowerCase().includes(term));
}

function renderCollectionChips() {
  const host = $("#collection-chips");
  if (!host) return;
  const active = activeCollection();

  host.innerHTML = collectionSlugs().map((slug) => {
    const pieces = collectionPieces(slug);
    const hidden = pieces.filter(p => p.hidden).length;
    return `
      <button type="button" class="collection-chip${slug === active ? " is-active" : ""}" data-collection="${escapeHtml(slug)}">
        ${escapeHtml(categoryName("art", slug))}
        <i>${pieces.length}${hidden ? ` &minus;${hidden}` : ""}</i>
      </button>`;
  }).join("");
}

async function runAction(button, work, success) {
  if (button) button.disabled = true;
  try {
    const message = await work();
    toast(message || success, "ok");
  } catch (err) {
    console.error(err);
    toast(err.message || "That did not work.", "error");
  } finally {
    if (button) button.disabled = false;
  }
}

function pickFile(accept = "image/*") {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => resolve(input.files[0] || null), { once: true });
    input.click();
  });
}

function releaseNote(released) {
  if (!released) return "";
  if (released.destroyed) return " The old file was deleted from Cloudinary.";
  if (released.reason === "in-use") return " The old file is still used elsewhere, so it was kept.";
  return "";
}

function renderCollection() {
  const host = $("#collection-grid");
  if (!host) return;

  const slug = activeCollection();
  const all = collectionPieces(slug);
  const list = all.filter(matchesSearch);
  const hidden = all.filter(p => p.hidden).length;

  $("#collection-count").textContent = all.length
    ? `${all.length} piece${all.length === 1 ? "" : "s"}${hidden ? ` · ${hidden} hidden` : ""}`
    : "nothing here yet";

  const viewLink = $("#collection-view");
  if (viewLink) {
    viewLink.href = slug ? categoryHref({ slug }) : "gallery.html";
    viewLink.hidden = !slug;
  }

  host.innerHTML = list.length
    ? ""
    : `<p class="empty-note">${all.length ? "Nothing matches that search." : slug ? "This collection is empty. Upload something above." : "Create a collection under Collections first."}</p>`;

  list.forEach((piece) => {
    const el = document.createElement("article");
    el.className = `m-card${piece.hidden ? " is-hidden-piece" : ""}`;
    el.dataset.selectionKey = piece.id;
    el.dataset.artId = piece.id;
    if (state.selectingArt) el.classList.add("is-selection-mode", "is-selectable", ...(state.selectedArt.has(piece.id) ? ["is-selected"] : []));
    const shown = piece.title || "Untitled";

    el.innerHTML = `
      ${piece.likes ? `<span class="m-badge">${piece.likes} &#9829;</span>` : ""}
      <img src="${escapeHtml(piece.imageUrl)}" alt="${escapeHtml(shown)}" loading="lazy">
      <div class="m-card-body">
        <h4>${escapeHtml(shown)}</h4>
        <p>${piece.caption ? escapeHtml(piece.caption) : ""}${piece.hidden ? ' <b style="color:var(--danger)">Hidden</b>' : ""}</p>
      </div>
      <div class="m-card-actions">
        ${state.selectingArt ? `<label class="bulk-select"><input type="checkbox" data-select-piece ${state.selectedArt.has(piece.id) ? "checked" : ""}> Select</label>` : `
          <button class="btn is-small" data-edit>Edit</button>
          <button class="btn is-small" data-replace>Replace</button>
          <button class="btn is-small" data-up ${piece.position === 0 ? "disabled" : ""} aria-label="Move earlier">&#9650;</button>
          <button class="btn is-small" data-down ${piece.position === all.length - 1 ? "disabled" : ""} aria-label="Move later">&#9660;</button>
          <button class="btn is-small" data-visible>${piece.hidden ? "Show" : "Hide"}</button>
          <button class="btn is-small is-danger" data-del>Select to delete</button>`}
      </div>
    `;

    if (state.selectingArt) {
      $("[data-select-piece]", el).addEventListener("click", (e) => {
        const index = list.findIndex(p => p.id === piece.id);
        if (e.shiftKey && state.artAnchor) {
          const anchorIndex = list.findIndex(p => p.id === state.artAnchor);
          if (anchorIndex >= 0) list.slice(Math.min(anchorIndex, index), Math.max(anchorIndex, index) + 1).forEach(p => e.target.checked ? state.selectedArt.add(p.id) : state.selectedArt.delete(p.id));
        } else {
          e.target.checked ? state.selectedArt.add(piece.id) : state.selectedArt.delete(piece.id);
          state.artAnchor = piece.id;
        }
        renderCollection();
        restoreSelectionFocus(host, "[data-select-piece]", piece.id);
      });
    } else {
      $("[data-edit]", el).addEventListener("click", () => editPiece(piece));

      $("[data-replace]", el).addEventListener("click", async (e) => {
        const file = await pickFile();
        if (!file) return;
        await runAction(e.target, async () => {
          const result = await replaceArtworkImage(piece.id, file);
          return `Picture replaced — title, likes and comments are untouched.${releaseNote(result.released)}`;
        });
      });

      $("[data-visible]", el).addEventListener("click", (e) => runAction(e.target,
        () => setArtworkVisibility(piece.id, piece.hidden),
        piece.hidden ? "Back on the site." : "Hidden from the site — you can put it back."));

      $("[data-del]", el).addEventListener("click", () => {
        state.selectingArt = true;
        state.selectedArt.clear();
        state.selectedArt.add(piece.id);
        state.artAnchor = piece.id;
        renderCollection();
      });

      const move = (delta) => (e) => runAction(e.target, async () => {
        const ids = all.map(p => p.id);
        const i = piece.position;
        [ids[i + delta], ids[i]] = [ids[i], ids[i + delta]];
        await reorderArtworks(ids);
      }, "Order saved.");
      $("[data-up]", el).addEventListener("click", move(-1));
      $("[data-down]", el).addEventListener("click", move(1));
    }

    host.appendChild(el);
  });
  updateBulkControls("art");
}

function updateBulkControls(kind) {
  const art = kind === "art";
  const selecting = art ? state.selectingArt : state.selectingComics;
  const count = (art ? state.selectedArt : state.selectedComics).size;
  const toggle = $(art ? "#art-select-toggle" : "#comic-select-toggle");
  const action = $(art ? "#art-delete-selected" : "#comic-delete-selected");
  const items = art
    ? collectionPieces(activeCollection()).filter(matchesSearch)
    : state.comics.filter(c => state.comicFilter === "all" || c.categorySlug === state.comicFilter);
  const countHost = $(art ? "#art-selected-count" : "#comic-selected-count");
  const allButton = $(art ? "#art-select-all" : "#comic-select-all");
  if (toggle) toggle.textContent = selecting ? "Cancel" : "Delete";
  if (countHost) { countHost.hidden = !selecting; countHost.textContent = `${count} selected`; }
  if (allButton) { allButton.hidden = !selecting || !items.length; allButton.textContent = items.length && items.every(item => (art ? state.selectedArt : state.selectedComics).has(item.id)) ? "Unselect all" : "Select all"; }
  if (action) {
    action.hidden = !selecting;
    action.disabled = !count;
    action.textContent = `Delete selected (${count})`;
  }
  saveDashboardState();
}

async function deleteSelected(kind) {
  const art = kind === "art";
  const ids = [...(art ? state.selectedArt : state.selectedComics)];
  if (!ids.length) return;
  const pages = art ? 0 : ids.reduce((sum, id) => sum + (state.comics.find(c => c.id === id)?.pages.length || 0), 0);
  confirmBulkDelete(ids.length, pages, async (report) => {
    const selected = art ? state.selectedArt : state.selectedComics;
    const errors = [];
    let deleted = 0;
    let kept = 0;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      report(`Deleting ${i + 1} of ${ids.length} — Cloudinary first, then the site…`);
      try {
        const result = art ? await deleteArtwork(id) : await deleteComic(id);
        if (!art && editingComicId === id) resetComicForm();
        const released = art ? [result.released] : result.released || [];
        kept += released.filter(r => r && r.reason === "in-use").length;
        selected.delete(id);
        deleted++;
      } catch (err) {
        console.error(`Delete failed for ${id}:`, err);
        errors.push({ id, message: err.message || "Delete failed." });
      }
    }
    if (!errors.length) {
      selected.clear();
      if (art) state.selectingArt = false; else state.selectingComics = false;
    }
    art ? renderCollection() : renderComics();
    const message = `${deleted} item${deleted === 1 ? "" : "s"} permanently deleted from the site and Cloudinary.${kept ? ` ${kept} file${kept === 1 ? " is" : "s are"} still used elsewhere and ${kept === 1 ? "was" : "were"} kept.` : ""}`;
    if (errors.length) {
      const first = errors[0];
      toast(`${message} ${errors.length} could not be deleted and are untouched — ${first.id}: ${first.message}`, "error");
      report(`${deleted} deleted. ${errors.length} still selected.`);
      throw new Error(first.message);
    }
    toast(message, "ok");
  });
}

function confirmBulkDelete(count, pages, remove) {
  if (!count || bulkDeleteOpen) return;
  bulkDeleteOpen = true;
  let dialog;
  dialog = modal({
    title: `Delete ${count} ${count === 1 ? "item" : "items"} permanently?`,
    body: `The files are deleted from Cloudinary and the records from the site. This cannot be undone.${pages ? ` This also removes all <b>${pages} page${pages === 1 ? "" : "s"}</b> in the selected stories.` : ""}<p data-delete-progress class="delete-progress" aria-live="polite" hidden></p>`,
    confirmLabel: "Delete",
    danger: true,
    onClose: () => { bulkDeleteOpen = false; },
    onConfirm: () => remove((message) => {
      const progress = $("[data-delete-progress]", dialog.overlay);
      if (progress) { progress.hidden = false; progress.textContent = message; }
    })
  });
}

$("#art-select-toggle")?.addEventListener("click", () => {
  state.selectingArt = !state.selectingArt;
  state.selectedArt.clear();
  state.artAnchor = null;
  renderCollection();
});
$("#art-delete-selected")?.addEventListener("click", () => deleteSelected("art"));
$("#art-select-all")?.addEventListener("click", () => {
  const set = state.selectedArt;
  const items = collectionPieces(activeCollection()).filter(matchesSearch);
  const allSelected = items.every(item => set.has(item.id));
  items.forEach(item => allSelected ? set.delete(item.id) : set.add(item.id));
  renderCollection();
});

function editPiece(piece) {
  modal({
    title: "Edit artwork",
    body: `
      <div class="field">
        <label for="ep-title">Title</label>
        <input id="ep-title" type="text" value="${escapeHtml(piece.title)}" placeholder="Empty shows no title">
      </div>
      <div class="field">
        <label for="ep-caption">Caption</label>
        <input id="ep-caption" type="text" value="${escapeHtml(piece.caption)}" placeholder="A short line under the title — medium, size, year">
      </div>
      <div class="field">
        <label for="ep-cat">Collection</label>
        <select id="ep-cat">${categoryOptions("art", piece.slug)}</select>
      </div>
      <div class="field">
        <label for="ep-desc">Description</label>
        <textarea id="ep-desc" placeholder="Shown under the caption on the collection page.">${escapeHtml(piece.description)}</textarea>
      </div>
    `,
    confirmLabel: "Save",
    onConfirm: async () => {
      await updateArtwork(piece.id, {
        title: $("#ep-title").value.trim(),
        caption: $("#ep-caption").value.trim(),
        category: $("#ep-cat").value,
        description: $("#ep-desc").value.trim()
      });
      toast("Saved — it's live on the site.", "ok");
    }
  });
}

function openCollection(slug) {
  showView("artworks");
  state.collection = slug;
  state.collectionSearch = "";
  state.selectedArt.clear();
  state.artAnchor = null;
  $("#collection-search").value = "";
  renderCollectionChips();
  renderCollection();
  saveDashboardState();
}

initAdminSearch({
  showView: (view) => { if (state.view !== view) showView(view); },
  openCollection,
  getData: () => ({ artCategories: state.artCategories, comicCategories: state.comicCategories, comics: state.comics })
});

$("#collection-chips")?.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-collection]");
  if (!chip) return;
  state.collection = chip.dataset.collection;
  state.collectionSearch = "";
  state.selectedArt.clear();
  state.artAnchor = null;
  $("#collection-search").value = "";
  renderCollectionChips();
  renderCollection();
  saveDashboardState();
});

$("#collection-search")?.addEventListener("input", (e) => {
  state.collectionSearch = e.target.value;
  renderCollection();
  saveDashboardState();
});

let comicCover = null;
let comicPages = [];
let editingComicId = null;
let comicSaving = false;

function lockComicForm(locked) {
  comicSaving = locked;
  $$("#comic-form input, #comic-form textarea, #comic-form select, #comic-form button").forEach((el) => {
    if (el.id !== "comic-save") el.disabled = locked;
  });
  $("#comic-form").classList.toggle("is-busy", locked);
}

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
  if (comicSaving) return;
  comicCover = files[0];
  renderComicCover();
});

wireDropzone($("#comic-pages-drop"), $("#comic-pages-input"), (files) => {
  if (comicSaving) return;
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
  if (!categorySlug) { toast("Create a genre under Collections first, then pick it.", "error"); return; }
  if (!comicPages.length) { toast("A story needs at least one page.", "error"); return; }

  const btn = $("#comic-save");
  if (comicSaving) return;
  btn.disabled = true;
  lockComicForm(true);
  $("#comic-progress").hidden = false;
  const bar = $("#comic-progress span");

  const jobs = comicPages.filter(p => typeof p !== "string").length
    + (comicCover && typeof comicCover !== "string" ? 1 : 0);
  let doneJobs = 0;
  const newAssets = [];
  const tick = (p) => { bar.style.width = `${((doneJobs + p) / Math.max(jobs, 1)) * 100}%`; };

  try {
    $("#comic-status").textContent = "Uploading pages…";
    const pageUrls = [];
    for (const page of comicPages) {
      if (typeof page === "string") { pageUrls.push(page); continue; }
      const asset = await uploadAndRecord(page, { usedFor: "comic-page", onProgress: tick });
      newAssets.push(asset);
      pageUrls.push(asset.url);
      doneJobs++;
    }

    let coverUrl = typeof comicCover === "string" ? comicCover : "";
    if (comicCover && typeof comicCover !== "string") {
      $("#comic-status").textContent = "Uploading cover…";
      const asset = await uploadAndRecord(comicCover, { usedFor: "comic-cover", onProgress: tick });
      newAssets.push(asset);
      coverUrl = asset.url;
      doneJobs++;
    }

    if (editingComicId) {
      $("#comic-status").textContent = "Saving story…";
      const result = await updateComic(editingComicId, {
        title,
        categorySlug,
        description: $("#comic-desc").value.trim(),
        coverUrl: coverUrl || pageUrls[0],
        pages: pageUrls
      });
      const removed = (result.released || []).filter(r => r?.destroyed).length;
      toast(`Story updated.${removed ? ` ${removed} replaced file${removed === 1 ? " was" : "s were"} deleted from Cloudinary.` : ""}`, "ok");
    } else {
      $("#comic-status").textContent = "Publishing story…";
      await createComic({
        title,
        categorySlug,
        description: $("#comic-desc").value.trim(),
        coverUrl: coverUrl || pageUrls[0],
        pages: pageUrls
      });
      toast("Story published.", "ok");
    }
    newAssets.length = 0;
    resetComicForm();
  } catch (err) {
    console.error(err);
    toast(err.message || "Publishing failed.", "error");
    for (const asset of newAssets) {
      try { await destroyAsset(asset.publicId, asset.resourceType || "image"); }
      catch (cleanupError) { console.error("Could not clean up a story upload after saving failed.", cleanupError); }
    }
  } finally {
    lockComicForm(false);
    btn.disabled = !comicPages.length;
    $("#comic-progress").hidden = true;
    bar.style.width = "0%";
    $("#comic-status").textContent = "";
  }
});

function loadComicIntoForm(comic) {
  if (comicSaving) return;
  editingComicId = comic.id;
  comicCover = comic.originalCoverUrl || null;
  comicPages = comic.originalPages.slice();
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
    el.className = `m-card is-story${comic.status === "published" ? "" : " is-hidden-piece"}`;
    el.dataset.selectionKey = comic.id;
    if (state.selectingComics) el.classList.add("is-selectable", ...(state.selectedComics.has(comic.id) ? ["is-selected"] : []));
    el.innerHTML = `
      <span class="m-badge">${comic.pages.length}p · ${comic.likes} &#9829;</span>
      <img class="m-cover" src="${escapeHtml(comic.coverUrl)}" alt="${escapeHtml(comic.title)}" loading="lazy">
      <div class="m-card-body">
        <h4>${escapeHtml(comic.title)}</h4>
        <p>${escapeHtml(categoryName("comics", comic.categorySlug))}${comic.status === "published" ? "" : ' · <b style="color:var(--danger)">Hidden</b>'}</p>
      </div>
      <div class="m-card-actions">
        ${state.selectingComics ? `<label class="bulk-select"><input type="checkbox" data-select-story ${state.selectedComics.has(comic.id) ? "checked" : ""}> Select</label>` : ""}
        ${state.selectingComics ? "" : `
        <button class="btn is-small" data-edit>Edit</button>
        <button class="btn is-small" data-up ${i === 0 ? "disabled" : ""}>&#9650;</button>
        <button class="btn is-small" data-down ${i === list.length - 1 ? "disabled" : ""}>&#9660;</button>
        <button class="btn is-small" data-visible>${comic.status === "published" ? "Hide" : "Show"}</button>
        <button class="btn is-small is-danger" data-del>Select to delete</button>`}
      </div>
    `;

    if (state.selectingComics) $("[data-select-story]", el).addEventListener("click", (e) => {
      if (e.shiftKey && state.comicAnchor) {
        const anchorIndex = list.findIndex(c => c.id === state.comicAnchor);
        const index = list.findIndex(c => c.id === comic.id);
        if (anchorIndex >= 0) list.slice(Math.min(anchorIndex, index), Math.max(anchorIndex, index) + 1).forEach(c => e.target.checked ? state.selectedComics.add(c.id) : state.selectedComics.delete(c.id));
      } else {
        e.target.checked ? state.selectedComics.add(comic.id) : state.selectedComics.delete(comic.id);
        state.comicAnchor = comic.id;
      }
      renderComics();
      restoreSelectionFocus(host, "[data-select-story]", comic.id);
    });
    if (!state.selectingComics) $("[data-edit]", el).addEventListener("click", () => loadComicIntoForm(comic));

    const moveStory = (delta) => (e) => runAction(e.target, async () => {
      const ids = list.map(c => c.id);
      [ids[i + delta], ids[i]] = [ids[i], ids[i + delta]];
      await reorderComics(ids);
    }, "Order saved.");
    if (!state.selectingComics) $("[data-up]", el).addEventListener("click", moveStory(-1));
    if (!state.selectingComics) $("[data-down]", el).addEventListener("click", moveStory(1));
    if (!state.selectingComics) $("[data-visible]", el).addEventListener("click", (e) => runAction(e.target,
      () => setComicVisibility(comic.id, comic.status !== "published"),
      comic.status === "published" ? "Story hidden from the site." : "Story back on the site."));

    if (!state.selectingComics) $("[data-del]", el).addEventListener("click", () => {
      state.selectingComics = true;
      state.selectedComics.clear();
      state.selectedComics.add(comic.id);
      state.comicAnchor = comic.id;
      renderComics();
    });

    host.appendChild(el);
  });
  updateBulkControls("comics");
}

$("#comic-filter").addEventListener("change", (e) => {
  state.comicFilter = e.target.value;
  state.selectedComics.clear();
  state.comicAnchor = null;
  renderComics();
  saveDashboardState();
});
$("#comic-select-toggle")?.addEventListener("click", () => {
  state.selectingComics = !state.selectingComics;
  state.selectedComics.clear();
  state.comicAnchor = null;
  renderComics();
});
$("#comic-delete-selected")?.addEventListener("click", () => deleteSelected("comics"));
$("#comic-select-all")?.addEventListener("click", () => {
  const set = state.selectedComics;
  const items = state.comics.filter(c => state.comicFilter === "all" || c.categorySlug === state.comicFilter);
  const allSelected = items.every(item => set.has(item.id));
  items.forEach(item => allSelected ? set.delete(item.id) : set.add(item.id));
  renderComics();
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  let changed = false;
  if (state.selectingArt) { state.selectingArt = false; state.selectedArt.clear(); state.artAnchor = null; renderCollection(); changed = true; }
  if (state.selectingComics) { state.selectingComics = false; state.selectedComics.clear(); state.comicAnchor = null; renderComics(); changed = true; }
  if (state.selectingArtCats) { state.selectingArtCats = false; state.selectedArtCats.clear(); renderCategoryList("art"); changed = true; }
  if (state.selectingComicCats) { state.selectingComicCats = false; state.selectedComicCats.clear(); renderCategoryList("comics"); changed = true; }
  if (state.selectingComments) { state.selectingComments = false; state.selectedComments.clear(); renderComments(); changed = true; }
  if (changed) e.stopPropagation();
});


function categoryList(kind) {
  return kind === "comics" ? state.comicCategories : state.artCategories;
}

function categoryName(kind, slug) {
  const found = categoryList(kind).find(c => c.slug === slug);
  if (found) return found.name || found.slug;
  if (!slug) return "Uncategorised";
  return `${slug} (deleted)`;
}

function categoryOptions(kind, selected) {
  return categoryList(kind)
    .map(c => `<option value="${escapeHtml(c.slug)}"${c.slug === selected ? " selected" : ""}>${escapeHtml(c.name)}</option>`)
    .join("");
}

function coverPreview(cat) {
  return cat.cover || "";
}

function usageCount(kind, slug) {
  return kind === "comics"
    ? state.comics.filter(c => c.categorySlug === slug).length
    : state.artworks.filter(a => a.uploaded && a.category === slug).length;
}

function renderCategoryList(kind) {
  const host = $(kind === "comics" ? "#comic-cat-rows" : "#art-cat-rows");
  const list = categoryList(kind);
  const selecting = kind === "comics" ? state.selectingComicCats : state.selectingArtCats;
  const selected = kind === "comics" ? state.selectedComicCats : state.selectedArtCats;

  host.innerHTML = list.length ? "" : '<p class="empty-note">No categories yet.</p>';

  list.forEach((cat, i) => {
    const used = usageCount(kind, cat.slug);
    const row = document.createElement("div");
    row.className = kind === "art" ? "row has-cover" : "row";
    row.dataset.selectionKey = cat.id;
    if (selecting && selected.has(cat.id)) row.classList.add("is-selected");
    row.innerHTML = `
      <div class="handle">
        <button type="button" data-up ${i === 0 ? "disabled" : ""} aria-label="Move up">&#9650;</button>
        <button type="button" data-down ${i === list.length - 1 ? "disabled" : ""} aria-label="Move down">&#9660;</button>
      </div>
      ${kind === "art" ? `<div class="cat-cover${cat.cover ? "" : " is-fallback"}">${coverPreview(cat) ? `<img src="${escapeHtml(coverPreview(cat))}" alt="" loading="lazy">` : ""}</div>` : ""}
      <div class="row-main">
        <strong>${escapeHtml(cat.name)}</strong>
        <small>/${escapeHtml(cat.slug)} · ${used} item${used === 1 ? "" : "s"}${cat.tagline ? ` · ${escapeHtml(cat.tagline)}` : ""}</small>
      </div>
      <div class="row-actions">
        ${selecting ? `<label class="bulk-select"><input type="checkbox" data-select-category ${selected.has(cat.id) ? "checked" : ""}> Select</label>` : ""}
        ${selecting ? "" : `
        ${kind === "art" ? `<a class="btn is-small" href="${escapeHtml(categoryHref({ slug: cat.slug }))}" target="_blank" rel="noopener">View</a>` : ""}
        <button class="btn is-small" data-edit-category>Edit</button>
        ${kind === "art" ? `<button class="btn is-small" data-cover>${cat.cover ? "Change cover" : "Set cover"}</button>` : ""}
        ${kind === "art" && cat.cover ? '<button class="btn is-small" data-cover-clear>Remove cover</button>' : ""}
        <button class="btn is-small is-danger" data-del>Select to delete</button>`}
      </div>
    `;

    if (selecting) $("[data-select-category]", row).addEventListener("click", (e) => {
      e.target.checked ? selected.add(cat.id) : selected.delete(cat.id);
      row.classList.toggle("is-selected", e.target.checked);
      updateDeleteSelection(kind === "comics" ? "comicCats" : "artCats");
    });

    const moveCategory = (delta) => (e) => runAction(e.target, async () => {
      const ids = list.map(c => c.id);
      [ids[i + delta], ids[i]] = [ids[i], ids[i + delta]];
      await reorderCategories(kind, ids);
    }, "Order saved.");
    if (!selecting) $("[data-up]", row).addEventListener("click", moveCategory(-1));
    if (!selecting) $("[data-down]", row).addEventListener("click", moveCategory(1));

    if (!selecting) $("[data-edit-category]", row).addEventListener("click", () => editCategory(kind, cat));

    if (!selecting && kind === "art") $("[data-cover]", row).addEventListener("click", async (e) => {
      const next = await pickImage(cat.cover || "");
      if (next === null || next === cat.cover) return;
      await runAction(e.target, async () => {
        const result = await setCategoryCover(cat.id, next);
        return `Cover updated — the gallery index shows it now.${releaseNote(result.released)}`;
      });
    });

    if (!selecting && kind === "art" && cat.cover) $("[data-cover-clear]", row).addEventListener("click", (e) => runAction(e.target, async () => {
      const result = await setCategoryCover(cat.id, "");
      return `Cover removed.${releaseNote(result.released)}`;
    }));

    if (!selecting) $("[data-del]", row).addEventListener("click", () => {
      const isComic = kind === "comics";
      const selection = isComic ? state.selectedComicCats : state.selectedArtCats;
      if (isComic) state.selectingComicCats = true; else state.selectingArtCats = true;
      selection.clear(); selection.add(cat.id);
      renderCategoryList(kind);
      updateDeleteSelection(isComic ? "comicCats" : "artCats");
    });

    host.appendChild(row);
  });
  updateDeleteSelection(kind === "comics" ? "comicCats" : "artCats");
}

function editCategory(kind, cat) {
  const noun = kind === "comics" ? "genre" : "collection";
  modal({
    title: `Edit ${noun}`,
    body: `
      <div class="field">
        <label for="ec-name">Name</label>
        <input type="text" id="ec-name" maxlength="80" value="${escapeHtml(cat.name)}">
      </div>
      <div class="field">
        <label for="ec-tagline">Tagline</label>
        <input type="text" id="ec-tagline" maxlength="200" value="${escapeHtml(cat.tagline)}" placeholder="A short line under the name">
      </div>
      <div class="field">
        <label for="ec-blurb">Description</label>
        <textarea id="ec-blurb" maxlength="1000" placeholder="A sentence or two introducing the ${noun}">${escapeHtml(cat.blurb)}</textarea>
      </div>
      <p class="field-note">The web address stays <b>/${escapeHtml(cat.slug)}</b> so existing links keep working.</p>`,
    confirmLabel: "Save",
    onMount: (overlay) => $("#ec-name", overlay).focus(),
    onConfirm: async () => {
      const name = $("#ec-name").value.trim();
      if (!name) throw new Error("Give it a name.");
      await updateCategory(kind, cat.id, {
        name,
        tagline: $("#ec-tagline").value.trim(),
        blurb: $("#ec-blurb").value.trim()
      });
      toast(`${name} saved — the site has it now.`, "ok");
    }
  });
}

function confirmCategoryDelete(kind, chosen, onDone) {
  if (bulkDeleteOpen) return;
  const noun = kind === "comics" ? "genre" : "collection";
  const items = (n) => kind === "comics" ? (n === 1 ? "story" : "stories") : (n === 1 ? "artwork" : "artworks");
  const total = chosen.reduce((n, c) => n + usageCount(kind, c.slug), 0);
  bulkDeleteOpen = true;
  const dialog = modal({
    title: `Delete ${chosen.length === 1 ? `“${chosen[0].name}”` : `${chosen.length} ${noun}s`}?`,
    body: `It comes off the homepage, the gallery and the footer straight away.
      ${total ? `<p><b>${total} ${items(total)} inside will be permanently deleted</b> — their files from Cloudinary and their records from the site.</p>
      <label class="bulk-select" style="margin-top:12px"><input type="checkbox" data-confirm-contents> Yes, delete the ${total} ${items(total)} too</label>` : ""}
      <p data-delete-progress class="delete-progress" aria-live="polite" hidden></p>`,
    confirmLabel: "Delete",
    danger: true,
    onClose: () => { bulkDeleteOpen = false; },
    onConfirm: async () => {
      if (total && !$("[data-confirm-contents]", dialog.overlay)?.checked) {
        throw new Error(`Tick the box to confirm the ${total} ${items(total)} should be deleted too.`);
      }
      const progress = $("[data-delete-progress]", dialog.overlay);
      const report = (text) => { progress.hidden = false; progress.textContent = text; };
      let removed = 0;
      for (let i = 0; i < chosen.length; i++) {
        report(`Deleting ${chosen[i].name} (${i + 1} of ${chosen.length})…`);
        const result = await deleteCategory(kind, chosen[i].id, {
          onProgress: (done, count) => report(`Deleting ${chosen[i].name}: ${done} of ${count} ${items(count)}…`)
        });
        removed += result.removed;
      }
      onDone();
      toast(`${chosen.length} ${noun}${chosen.length === 1 ? "" : "s"} deleted${removed ? ` with ${removed} ${items(removed)}` : ""}.`, "ok");
    }
  });
}

function updateDeleteSelection(type) {
  const config = {
    artCats: ["#art-cat-select-toggle", "#art-cat-selected-count", "#art-cat-select-all", "#art-cat-delete-selected", state.selectedArtCats, state.selectingArtCats, state.artCategories],
    comicCats: ["#comic-cat-select-toggle", "#comic-cat-selected-count", "#comic-cat-select-all", "#comic-cat-delete-selected", state.selectedComicCats, state.selectingComicCats, state.comicCategories],
    comments: ["#comment-select-toggle", "#comment-selected-count", "#comment-select-all", "#comment-delete-selected", state.selectedComments, state.selectingComments, state.comments]
  }[type];
  if (!config) return;
  const [toggleSel, countSel, allSel, deleteSel, selected, selecting, items] = config;
  const toggle = $(toggleSel), count = $(countSel), all = $(allSel), del = $(deleteSel);
  if (toggle) toggle.textContent = selecting ? "Cancel" : "Delete";
  if (count) { count.hidden = !selecting; count.textContent = `${selected.size} selected`; }
  if (all) { all.hidden = !selecting || !items.length; all.textContent = items.length && items.every(item => selected.has(selectionKey(type, item))) ? "Unselect all" : "Select all"; }
  if (del) { del.hidden = !selecting; del.disabled = !selected.size; del.textContent = `Delete selected (${selected.size})`; }
  saveDashboardState();
}

function selectionKey(type, item) {
  return type === "comments" ? `${item.parentCollection}/${item.parentId}/${item.id}` : item.id;
}

async function deleteSelectedRecords(type) {
  const map = {
    artCats: [state.selectedArtCats, state.artCategories],
    comicCats: [state.selectedComicCats, state.comicCategories],
    comments: [state.selectedComments, state.comments]
  }[type];
  const [selected, items] = map;
  const chosen = items.filter(item => selected.has(selectionKey(type, item)));
  if (!chosen.length) return;
  if (type !== "comments") {
    const kind = type === "comicCats" ? "comics" : "art";
    confirmCategoryDelete(kind, chosen, () => {
      selected.clear();
      if (kind === "comics") state.selectingComicCats = false; else state.selectingArtCats = false;
      renderCategoryList(kind);
    });
    return;
  }
  confirmBulkDelete(chosen.length, 0, async (report) => {
    for (let i = 0; i < chosen.length; i++) {
      const item = chosen[i];
      report(`Deleting ${i + 1} of ${chosen.length}…`);
      await deleteComment(item.parentCollection, item.parentId, item.id);
    }
    selected.clear();
    if (type === "comments") { state.selectingComments = false; renderComments(); }
    else {
      if (type === "comicCats") state.selectingComicCats = false; else state.selectingArtCats = false;
      renderCategoryList(type === "comicCats" ? "comics" : "art");
    }
    toast(`${chosen.length} item${chosen.length === 1 ? "" : "s"} permanently deleted.`, "ok");
  });
}

function wireDeleteSelection(type) {
  const selectors = {
    artCats: ["#art-cat-select-toggle", "#art-cat-select-all", "#art-cat-delete-selected"],
    comicCats: ["#comic-cat-select-toggle", "#comic-cat-select-all", "#comic-cat-delete-selected"],
    comments: ["#comment-select-toggle", "#comment-select-all", "#comment-delete-selected"]
  }[type];
  const [toggleSel, allSel, deleteSel] = selectors;
  const get = () => type === "artCats" ? [state.selectedArtCats, state.artCategories, "selectingArtCats"]
    : type === "comicCats" ? [state.selectedComicCats, state.comicCategories, "selectingComicCats"]
    : [state.selectedComments, state.comments, "selectingComments"];
  $(toggleSel)?.addEventListener("click", () => {
    const [selected, , flag] = get();
    state[flag] = !state[flag]; selected.clear();
    if (type === "comments") renderComments(); else renderCategoryList(type === "comicCats" ? "comics" : "art");
    updateDeleteSelection(type);
  });
  $(allSel)?.addEventListener("click", () => {
    const [selected, items] = get();
    const allSelected = items.every(item => selected.has(selectionKey(type, item)));
    items.forEach(item => allSelected ? selected.delete(selectionKey(type, item)) : selected.add(selectionKey(type, item)));
    if (type === "comments") renderComments(); else renderCategoryList(type === "comicCats" ? "comics" : "art");
  });
  $(deleteSel)?.addEventListener("click", () => deleteSelectedRecords(type));
}

wireDeleteSelection("artCats");
wireDeleteSelection("comicCats");
wireDeleteSelection("comments");

function wireCategoryCreate(kind, formId, inputId) {
  $(formId).addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $(inputId);
    const name = input.value.trim();
    if (!name) return;
    try {
      await createCategory(kind, name);
      input.value = "";
      toast(`Created "${name}".`, "ok");
    } catch (err) {
      console.error(err);
      toast(err.message, "error");
    }
  });
}

wireCategoryCreate("art", "#art-cat-form", "#art-cat-name");
wireCategoryCreate("comics", "#comic-cat-form", "#comic-cat-name");

function refreshCategorySelects() {
  const keep = (el, html) => {
    if (!el) return;
    const v = el.value;
    el.innerHTML = html;
    el.value = v || el.options[0]?.value;
  };

  keep($("#art-category"), categoryOptions("art"));
  keep($("#comic-category"), categoryOptions("comics"));
  keep($("#comic-filter"), `<option value="all">All genres</option>${categoryOptions("comics")}`);
}


function renderComments() {
  const host = $("#comment-rows");
  $("#comment-total").textContent = state.comments.length;
  host.innerHTML = state.comments.length ? "" : '<p class="empty-note">No comments yet.</p>';
  state.comments.forEach((c) => {
    const key = selectionKey("comments", c);
    const source = c.parentCollection === "comics"
      ? state.comics.find(x => x.id === c.parentId)?.title
      : state.artworks.find(x => x.id === c.parentId)?.title;
    const row = document.createElement("div");
    row.className = "row row-comment";
    row.dataset.selectionKey = key;
    if (state.selectingComments && state.selectedComments.has(key)) row.classList.add("is-selected");
    row.innerHTML = `
      <div class="row-main">
        <strong>${escapeHtml(c.name)}</strong>
        <small>on ${escapeHtml(source || c.parentId)} | ${relativeTime(c.createdAt / 1000)}</small>
        <span>${escapeHtml(c.text)}</span>
      </div>
      <div class="row-actions">
        ${state.selectingComments ? `<label class="bulk-select"><input type="checkbox" data-select-comment ${state.selectedComments.has(key) ? "checked" : ""}> Select</label>` : '<button class="btn is-small is-danger" data-del>Select to delete</button>'}
      </div>`;
    if (state.selectingComments) $("[data-select-comment]", row).addEventListener("click", (e) => {
      e.target.checked ? state.selectedComments.add(key) : state.selectedComments.delete(key);
      row.classList.toggle("is-selected", e.target.checked);
      updateDeleteSelection("comments");
    });
    else $("[data-del]", row).addEventListener("click", () => {
      state.selectingComments = true;
      state.selectedComments.clear();
      state.selectedComments.add(key);
      renderComments();
      updateDeleteSelection("comments");
    });
    host.appendChild(row);
  });
  updateDeleteSelection("comments");
}
async function paintIdentity(user) {
  $("#admin-uid").textContent = user.uid || "unavailable";
  const stateEl = $("#admin-claim-state");

  let claimed = false;
  try {
    const token = await user.getIdTokenResult?.(true);
    claimed = token?.claims?.admin === true;
  } catch (err) {
    console.error("Could not read the ID token claims:", err);
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
  } catch (err) {
    console.error("Clipboard write failed:", err);
    toast(uid, "");
  }
});

$("#grant-claim").addEventListener("click", async () => {
  const btn = $("#grant-claim");
  btn.disabled = true;
  try {
    const res = await grantAdminClaim();
    toast(`Claim granted to ${res.email}. Sign out and back in to activate it.`, "ok");
  } catch (err) {
    console.error(err);
    toast(err.message, "error");
    btn.disabled = false;
  }
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


function boot() {
  refreshCategorySelects();
  renderCollectionChips();
  renderCollection();

  watchCategories("art", (items) => {
    state.artCategories = items;
    refreshCategorySelects();
    renderCategoryList("art");
    renderCollectionChips();
    renderCollection();
    renderOverview();
    setSettingsCategories(items);
    setPreviewCategories(items);
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
    renderCollectionChips();
    renderCollection();
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
  }, (err) => {
    $("#comment-rows").innerHTML = `<p class="empty-note">Comments couldn't be loaded: ${escapeHtml(err.message)}</p>`;
  });

  watchChangeLog(renderChangeLog, (err) => {
    $("#changelog-rows").innerHTML = `<p class="empty-note">Change log unavailable: ${escapeHtml(err.message)}</p>`;
  });

  renderArtFiles();
  renderComicPages();
  renderComicCover();

  initSettings().catch((err) => {
    console.error("Settings failed to load:", err);
    $("#settings-body").innerHTML =
      `<p class="empty-note">Settings could not be loaded: ${escapeHtml(err.message)}</p>`;
  });
  initPreview();
}
