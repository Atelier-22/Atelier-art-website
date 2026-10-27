import { watchAuth, isOwner, ownerLogin, ownerLogout, ownerPasswordReset, authReady } from "../../firebase-config.js?v=20260823a";
import {
  watchCategories, seedDefaultCategories, createCategory, updateCategory,
  reorderCategories, deleteCategory,
  watchAllArtworks, createArtwork, updateArtwork, deleteArtwork,
  archivePieceId, saveArchivePiece, setArchiveVisibility, replaceArchiveImage,
  reorderArchivePieces, moveArchiveToCloudinary, publicIdFromUrl,
  watchComics, createComic, updateComic, getComicDeletionPlan, deleteComic, reorderComics,
  watchAllComments, deleteComment, uploadAndRecord,
  grantAdminClaim, watchChangeLog, logChange
} from "./data.js?v=20260823a";
import { categoryHref, LOCAL_SEEDS, CATEGORY_BY_SLUG } from "./site-data.js?v=20260823a";
import {
  $, $$, escapeHtml, relativeTime, toast, modal
} from "./admin-ui.js?v=20261027d";
import {
  initSettings, setSettingsCategories, pickImage, setActiveView,
  hasUnpublishedChanges, publishSettingsChanges
} from "./admin-settings.js?v=20261027d";
import { initPreview, setPreviewCategories, onPreviewShown } from "./admin-preview.js?v=20260823a";

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
  } catch { }
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
    const restoreScroll = () => {
      if (document.documentElement.scrollHeight >= targetY + window.innerHeight || attempts++ >= 20) {
        window.scrollTo(0, targetY);
        state.dashboardRestored = true;
        saveDashboardState();
      } else setTimeout(restoreScroll, 200);
    };
    requestAnimationFrame(() => requestAnimationFrame(restoreScroll));
  } catch { state.dashboardRestored = true; }
}

window.addEventListener("scroll", saveDashboardState, { passive: true });
window.addEventListener("pagehide", saveDashboardState);

const LOGIN_ERRORS = {
  "auth/invalid-email": "That doesn't look like an email address.",
  "auth/user-not-found": "No owner account uses that address.",
  "auth/wrong-password": "That password isn't right for this address.",
  "auth/invalid-credential": "That email and password combination wasn't accepted.",
  "auth/invalid-login-credentials": "That email and password combination wasn't accepted.",
  "auth/owner-access-denied": "This account signed in, but it is not authorized to access the studio dashboard. Use an owner account.",
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
      const error = new Error("This account signed in, but it is not authorized to access the studio dashboard. Use an owner account.");
      error.code = "auth/owner-access-denied";
      throw error;
    }
  } catch (error) {
    const code = error?.code || "";
    err.textContent = LOGIN_ERRORS[code] || `Sign-in failed (${code || error?.message || "unknown"}).`;
    err.hidden = false;
    console.error("Sign-in failed:", error);
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
    status.textContent = "If an account exists for that email, Firebase has sent a password reset link.";
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
  if (!await hasUnpublishedChanges()) { await ownerLogout(); return; }
  modal({
    title: "Unpublished changes",
    body: "You have unpublished changes. Publish them now?",
    confirmLabel: "Yes, publish",
    cancelLabel: "No, log out",
    onConfirm: async () => { await publishSettingsChanges(); await ownerLogout(); },
    onCancel: ownerLogout
  });
});

watchAuth((user) => {
  if (isOwner(user)) {
    loginScreen.hidden = true;
    shell.hidden = false;
    $("#who").textContent = user.email;
    paintIdentity(user).catch(err => console.warn("Identity panel failed:", err));
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
      err.textContent = "This account is signed in, but it is not authorized to access the studio dashboard. Use an owner account.";
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

function collectionSlugs() {
  const fromCategories = state.artCategories
    .filter(c => c.slug !== "comics")
    .map(c => c.slug);
  const fromFolders = Object.keys(LOCAL_SEEDS)
    .filter(slug => (LOCAL_SEEDS[slug] || []).length && !CATEGORY_BY_SLUG[slug]?.isComics);
  return Array.from(new Set([...fromCategories, ...fromFolders]));
}

function archivePlaceholder(slug, i) {
  const label = CATEGORY_BY_SLUG[slug]?.label || categoryName("art", slug);
  return `${label.replace(/s$/, "")} No. ${String(i + 1).padStart(2, "0")}`;
}

function archiveSeeded(slug) {
  return state.artworks.some(a => a.archive && a.category === slug && a.imageUrl);
}

function archivePieces(slug) {
  if (archiveSeeded(slug)) {
    return state.artworks
      .filter(a => a.archive && a.category === slug && a.imageUrl)
      .sort((a, b) => a.order - b.order)
      .map((record, position) => {
        const index = Number(String(record.id).split("-").pop()) - 1;
        return {
          id: record.id,
          slug,
          kind: "archive",
          position,
          imageUrl: record.imageUrl,
          title: record.hasTitle ? record.title : "",
          placeholder: archivePlaceholder(slug, Number.isFinite(index) ? index : position),
          description: record.description,
          likes: record.likes,
          hidden: record.hidden,
          onCloudinary: /^https?:/i.test(record.imageUrl),
          managed: true
        };
      });
  }

  return (LOCAL_SEEDS[slug] || []).map((src, i) => {
    const id = archivePieceId(slug, i);
    const saved = state.artworks.find(a => a.id === id);
    return {
      id, slug, kind: "archive", position: i, imageUrl: src,
      title: saved?.hasTitle ? saved.title : "",
      placeholder: archivePlaceholder(slug, i),
      description: saved?.description || "",
      likes: saved?.likes || 0,
      hidden: false,
      onCloudinary: false,
      managed: false
    };
  });
}

function uploadedPieces(slug) {
  return state.artworks
    .filter(a => a.uploaded && a.imageUrl && a.category === slug)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(a => ({
      id: a.id,
      slug,
      kind: "upload",
      imageUrl: a.imageUrl,
      title: a.title,
      placeholder: a.title,
      description: a.description,
      likes: a.likes,
      hidden: a.hidden,
      onCloudinary: /^https?:/i.test(a.imageUrl),
      managed: true
    }));
}

function collectionPieces(slug) {
  return [...uploadedPieces(slug), ...archivePieces(slug)];
}

function activeCollection() {
  const slugs = collectionSlugs();
  if (!slugs.includes(state.collection)) state.collection = slugs[0] || "";
  return state.collection;
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

function renderCollection() {
  const host = $("#collection-grid");
  if (!host) return;

  const slug = activeCollection();
  const term = state.collectionSearch.trim().toLowerCase();
  const all = collectionPieces(slug);
  const seeded = !all.some(p => p.kind === "archive" && !p.managed);
  const archiveCount = archivePieces(slug).length;

  const list = all.filter(p =>
    !term || p.title.toLowerCase().includes(term) || p.placeholder.toLowerCase().includes(term));

  const hidden = all.filter(p => p.hidden).length;
  const onCloud = all.filter(p => p.onCloudinary).length;

  $("#collection-count").textContent = all.length
    ? `${all.length} piece${all.length === 1 ? "" : "s"}`
      + (hidden ? ` · ${hidden} hidden` : "")
      + ` · ${onCloud} of ${all.length} on Cloudinary`
    : "nothing here yet";

  const viewLink = $("#collection-view");
  if (viewLink) viewLink.href = categoryHref({ slug });

  const notice = $("#archive-notice");
  if (notice) notice.hidden = seeded;
  $("#archive-migrate").hidden = !seeded || !all.length || onCloud === all.length;

  host.innerHTML = list.length
    ? ""
    : `<p class="empty-note">${all.length ? "Nothing matches that search." : "This collection is empty. Upload something above."}</p>`;

  list.forEach((piece) => {
    const el = document.createElement("article");
    el.className = `m-card${piece.hidden ? " is-hidden-piece" : ""}`;
    el.dataset.selectionKey = piece.id;
    if (state.selectingArt) el.classList.add("is-selection-mode");
    if (state.selectingArt && piece.managed) el.classList.add("is-selectable", ...(state.selectedArt.has(piece.id) ? ["is-selected"] : []));
    const shown = piece.title || piece.placeholder;

    el.innerHTML = `
      ${piece.likes ? `<span class="m-badge">${piece.likes} &#9829;</span>` : ""}
      <img src="${escapeHtml(piece.imageUrl)}" alt="${escapeHtml(shown)}" loading="lazy">
      <div class="m-card-body">
        <h4>${escapeHtml(shown)}</h4>
        <p>
          ${piece.kind === "upload" ? "Uploaded" : piece.title ? "Named" : "Unnamed"}
          ${piece.hidden ? ' · <b style="color:var(--danger)">Hidden</b>' : ""}
          ${piece.onCloudinary ? " · Cloudinary" : ""}
        </p>
      </div>
      <div class="m-card-actions">
        ${state.selectingArt && piece.managed ? `<label class="bulk-select"><input type="checkbox" data-select-piece ${state.selectedArt.has(piece.id) ? "checked" : ""}> Select</label>` : ""}
        <button class="btn is-small" data-edit>${piece.kind === "upload" || piece.title ? "Edit" : "Add a title"}</button>
        ${piece.managed ? `
          <button class="btn is-small" data-replace>Replace</button>
          ${piece.kind === "archive" ? `
            <button class="btn is-small" data-up ${piece.position === 0 ? "disabled" : ""} aria-label="Move earlier">&#9650;</button>
            <button class="btn is-small" data-down ${piece.position === archiveCount - 1 ? "disabled" : ""} aria-label="Move later">&#9660;</button>` : ""}
          <button class="btn is-small" data-visible>${piece.hidden ? "Show" : "Hide"}</button>
          ${state.selectingArt ? "" : '<button class="btn is-small is-danger" data-del>Select to delete</button>'}` : ""}
      </div>
    `;

    if (state.selectingArt && piece.managed) {
      $("[data-select-piece]", el).addEventListener("click", (e) => {
        const selectable = list.filter(p => p.managed);
        const index = selectable.findIndex(p => p.id === piece.id);
        if (e.shiftKey && state.artAnchor) {
          const anchorIndex = selectable.findIndex(p => p.id === state.artAnchor);
          if (anchorIndex >= 0) selectable.slice(Math.min(anchorIndex, index), Math.max(anchorIndex, index) + 1).forEach(p => e.target.checked ? state.selectedArt.add(p.id) : state.selectedArt.delete(p.id));
        } else {
          e.target.checked ? state.selectedArt.add(piece.id) : state.selectedArt.delete(piece.id);
          state.artAnchor = piece.id;
        }
        renderCollection();
        restoreSelectionFocus(host, "[data-select-piece]", piece.id);
      });
    }
    if (!state.selectingArt) $("[data-edit]", el).addEventListener("click", () => editPiece(piece));

    if (piece.managed) {
      if (!state.selectingArt) $("[data-replace]", el).addEventListener("click", async () => {
        const next = await pickImage(piece.imageUrl);
        if (!next) return;
        const patch = { imageUrl: next, publicId: publicIdFromUrl(next) };
        if (piece.kind === "upload") await updateArtwork(piece.id, patch);
        else await replaceArchiveImage(piece.id, patch);
        toast("Picture replaced — its title, likes and comments are untouched.", "ok");
      });

      if (!state.selectingArt) $("[data-visible]", el).addEventListener("click", async () => {
        await setArchiveVisibility(piece.id, piece.hidden);
        toast(piece.hidden ? "Back on the site." : "Hidden from the site — you can put it back.", "ok");
      });

      if (!state.selectingArt) $("[data-del]", el).addEventListener("click", () => {
        state.selectingArt = true;
        state.selectedArt.clear();
        state.selectedArt.add(piece.id);
        state.artAnchor = piece.id;
        renderCollection();
      });

      if (piece.kind === "archive") {
        const move = async (delta) => {
          const ids = archivePieces(slug).map(p => p.id);
          const i = piece.position;
          [ids[i + delta], ids[i]] = [ids[i], ids[i + delta]];
          await reorderArchivePieces(ids);
        };
        $("[data-up]", el).addEventListener("click", () => move(-1));
        $("[data-down]", el).addEventListener("click", () => move(1));
      }
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
    ? collectionPieces(activeCollection()).filter(p => p.managed && (!state.collectionSearch.trim() || p.title.toLowerCase().includes(state.collectionSearch.trim().toLowerCase()) || p.placeholder.toLowerCase().includes(state.collectionSearch.trim().toLowerCase())))
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
  let plans = [];
  if (!art) {
    try { plans = await Promise.all(ids.map(id => getComicDeletionPlan(id))); }
    catch (err) { toast(err.message || "Couldn't check the selected stories.", "error"); return; }
  }
  const pages = plans.reduce((sum, plan) => sum + plan.pages.length, 0);
  const existingCount = art ? ids.length : plans.filter(plan => plan.exists).length;
  if (!existingCount) { toast("Those items no longer exist.", "error"); return; }
  confirmBulkDelete(existingCount, pages, async () => {
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (art) await deleteArtwork(id);
      else {
        await deleteComic(id, plans[i]);
        if (editingComicId === id) resetComicForm();
      }
    }
    if (art) { state.selectedArt.clear(); state.selectingArt = false; }
    else { state.selectedComics.clear(); state.selectingComics = false; }
    art ? renderCollection() : renderComics();
    toast(`${ids.length} item${ids.length === 1 ? "" : "s"} permanently deleted.`, "ok");
  });
}

function confirmBulkDelete(count, pages, remove) {
  if (!count) return;
  modal({
    title: `Delete ${count} ${count === 1 ? "item" : "items"} permanently?`,
    body: `This cannot be undone.${pages ? ` This also removes all <b>${pages} page${pages === 1 ? "" : "s"}</b> in the selected stories.` : ""}`,
    confirmLabel: "Delete",
    danger: true,
    onConfirm: remove
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
  const term = state.collectionSearch.trim().toLowerCase();
  const items = collectionPieces(activeCollection()).filter(p => p.managed && (!term || p.title.toLowerCase().includes(term) || p.placeholder.toLowerCase().includes(term)));
  const allSelected = items.every(item => set.has(item.id));
  items.forEach(item => allSelected ? set.delete(item.id) : set.add(item.id));
  renderCollection();
});

function editPiece(piece) {
  const isUpload = piece.kind === "upload";

  modal({
    title: isUpload ? "Edit artwork" : piece.title ? "Edit this piece" : "Name this piece",
    body: `
      <div class="field">
        <label for="ep-title">Title</label>
        <input id="ep-title" type="text" value="${escapeHtml(piece.title)}"
               placeholder="${escapeHtml(piece.placeholder)}">
        ${isUpload ? "" : `<p class="form-note">Leave this blank and the piece goes back to showing &ldquo;${escapeHtml(piece.placeholder)}&rdquo;.</p>`}
      </div>
      ${isUpload ? `
        <div class="field">
          <label for="ep-cat">Collection</label>
          <select id="ep-cat">${categoryOptions("art", piece.slug)}</select>
        </div>` : ""}
      <div class="field">
        <label for="ep-desc">${isUpload ? "Description" : "What it means"}</label>
        <textarea id="ep-desc" placeholder="Shown under the title on the collection page.">${escapeHtml(piece.description)}</textarea>
      </div>
    `,
    confirmLabel: "Save",
    onConfirm: async () => {
      const title = $("#ep-title").value;
      const description = $("#ep-desc").value.trim();

      if (isUpload) {
        await updateArtwork(piece.id, {
          title: title.trim() || piece.title,
          category: $("#ep-cat").value,
          description
        });
      } else {
        await saveArchivePiece(piece.id, { categorySlug: piece.slug, title, description });
      }
      toast("Saved — it's live on the site.", "ok");
    }
  });
}

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

$("#archive-setup")?.addEventListener("click", async () => {
  const btn = $("#archive-setup");
  const status = $("#archive-setup-status");
  btn.disabled = true;
  status.textContent = "Setting up…";
  try {
    const { seedArchiveRecords } = await import("./migrate.js?v=20260823a");
    const written = await seedArchiveRecords();
    status.textContent = "";
    toast(`${written} pieces are now fully manageable.`, "ok");
  } catch (err) {
    console.error(err);
    status.textContent = err.message || "That didn't work.";
    btn.disabled = false;
  }
});

function migrateCategoryToCloudinary() {
  const slug = activeCollection();
  const pending = collectionPieces(slug).filter(p => p.managed && !p.onCloudinary);

  if (!pending.length) {
    toast("This collection is already on Cloudinary.", "ok");
    return;
  }

  modal({
    title: `Move ${categoryName("art", slug)} to Cloudinary?`,
    body: `<b>${pending.length}</b> image${pending.length === 1 ? "" : "s"} will be uploaded to Cloudinary,
           and each piece will start using the uploaded copy.<br><br>
           Nothing is deleted and nothing on the site changes visually. It is safe to
           re-run &mdash; anything already moved is skipped &mdash; and safe to interrupt.`,
    confirmLabel: "Start the move",
    onConfirm: async () => {
      const status = $("#archive-migrate-status");
      status.textContent = "Starting…";
      const { moved, total, failures } = await moveArchiveToCloudinary(pending, (done, count, name) => {
        status.textContent = `Moved ${Math.floor(done)} of ${count}${name ? ` — ${name}` : ""}…`;
      });
      status.textContent = failures.length
        ? `${moved} of ${total} moved. ${failures.length} failed — see the console.`
        : `All ${moved} moved to Cloudinary.`;
      if (failures.length) console.warn(failures);
      toast(failures.length ? "Finished with some failures." : "Collection moved to Cloudinary.", failures.length ? "error" : "ok");
    }
  });
}

$("#archive-migrate")?.addEventListener("click", migrateCategoryToCloudinary);

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
      const asset = await uploadAndRecord(page, { usedFor: "comic-page", onProgress: tick });
      pageUrls.push(asset.url);
      doneJobs++;
    }

    let coverUrl = typeof comicCover === "string" ? comicCover : "";
    if (comicCover && typeof comicCover !== "string") {
      $("#comic-status").textContent = "Uploading cover…";
      const asset = await uploadAndRecord(comicCover, { usedFor: "comic-cover", onProgress: tick });
      coverUrl = asset.url;
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
    el.dataset.selectionKey = comic.id;
    if (state.selectingComics) el.classList.add("is-selectable", ...(state.selectedComics.has(comic.id) ? ["is-selected"] : []));
    el.innerHTML = `
      <span class="m-badge">${comic.pages.length}p · ${comic.likes} &#9829;</span>
      <img class="m-cover" src="${escapeHtml(comic.coverUrl)}" alt="${escapeHtml(comic.title)}" loading="lazy">
      <div class="m-card-body">
        <h4>${escapeHtml(comic.title)}</h4>
        <p>${escapeHtml(categoryName("comics", comic.categorySlug))}</p>
      </div>
      <div class="m-card-actions">
        ${state.selectingComics ? `<label class="bulk-select"><input type="checkbox" data-select-story ${state.selectedComics.has(comic.id) ? "checked" : ""}> Select</label>` : ""}
        ${state.selectingComics ? "" : `
        <button class="btn is-small" data-edit>Edit</button>
        <button class="btn is-small" data-up ${i === 0 ? "disabled" : ""}>&#9650;</button>
        <button class="btn is-small" data-down ${i === list.length - 1 ? "disabled" : ""}>&#9660;</button>
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

    if (!state.selectingComics) $("[data-up]", el).addEventListener("click", async () => {
      const ids = list.map(c => c.id);
      [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
      await reorderComics(ids);
    });

    if (!state.selectingComics) $("[data-down]", el).addEventListener("click", async () => {
      const ids = list.map(c => c.id);
      [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]];
      await reorderComics(ids);
    });

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
  const selecting = kind === "comics" ? state.selectingComicCats : state.selectingArtCats;
  const selected = kind === "comics" ? state.selectedComicCats : state.selectedArtCats;

  host.innerHTML = list.length ? "" : '<p class="empty-note">No categories yet.</p>';

  list.forEach((cat, i) => {
    const used = usageCount(kind, cat.slug);
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.selectionKey = cat.id;
    if (selecting && selected.has(cat.id)) row.classList.add("is-selected");
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
        ${selecting ? `<label class="bulk-select"><input type="checkbox" data-select-category ${selected.has(cat.id) ? "checked" : ""}> Select</label>` : ""}
        ${selecting ? "" : `
        ${kind === "art" ? `<a class="btn is-small" href="${escapeHtml(categoryHref({ slug: cat.slug }))}" target="_blank" rel="noopener">View</a>` : ""}
        <button class="btn is-small" data-rename>Rename</button>
        <button class="btn is-small is-danger" data-del>Select to delete</button>`}
      </div>
    `;

    if (selecting) $("[data-select-category]", row).addEventListener("click", (e) => {
      e.target.checked ? selected.add(cat.id) : selected.delete(cat.id);
      row.classList.toggle("is-selected", e.target.checked);
      updateDeleteSelection(kind === "comics" ? "comicCats" : "artCats");
    });

    if (!selecting) $("[data-up]", row).addEventListener("click", async () => {
      const ids = list.map(c => c.id);
      [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
      await ensureSeeded(kind);
      await reorderCategories(kind, ids);
    });

    if (!selecting) $("[data-down]", row).addEventListener("click", async () => {
      const ids = list.map(c => c.id);
      [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]];
      await ensureSeeded(kind);
      await reorderCategories(kind, ids);
    });

    if (!selecting) $("[data-rename]", row).addEventListener("click", () => {
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
  confirmBulkDelete(chosen.length, 0, async () => {
    for (const item of chosen) {
      if (type === "comments") await deleteComment(item.parentCollection, item.parentId, item.id);
      else {
        const kind = type === "comicCats" ? "comics" : "art";
        await ensureSeeded(kind);
        await deleteCategory(kind, item.id);
      }
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
    const { dryRun } = await import("./migrate.js?v=20260823a");
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
      const { apply } = await import("./migrate.js?v=20260823a");
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

  initSettings().catch((err) => {
    console.error("Settings failed to load:", err);
    $("#settings-body").innerHTML =
      '<p class="empty-note">Settings could not be loaded. Check that the updated rules are published.</p>';
  });
  initPreview();
}
