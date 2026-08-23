import { watchAuth, isOwner, ownerLogin, ownerLogout } from "../../firebase-config.js?v=20260823a";
import {
  watchCategories, seedDefaultCategories, createCategory, updateCategory,
  reorderCategories, deleteCategory,
  watchAllArtworks, createArtwork, updateArtwork, deleteArtwork,
  archivePieceId, saveArchivePiece, setArchiveVisibility, replaceArchiveImage,
  reorderArchivePieces, moveArchiveToCloudinary, publicIdFromUrl,
  watchComics, createComic, updateComic, deleteComic, reorderComics,
  watchAllComments, deleteComment, uploadAndRecord,
  grantAdminClaim, watchChangeLog, logChange
} from "./data.js?v=20260823a";
import { categoryHref, LOCAL_SEEDS, CATEGORY_BY_SLUG } from "./site-data.js?v=20260823a";
import {
  $, $$, escapeHtml, relativeTime, toast, modal, confirmDelete
} from "./admin-ui.js?v=20260823a";
import {
  initSettings, setSettingsCategories, pickImage, setActiveView
} from "./admin-settings.js?v=20260823a";
import { initPreview, setPreviewCategories, onPreviewShown } from "./admin-preview.js?v=20260823a";

const state = {
  artCategories: [],
  comicCategories: [],
  artworks: [],
  comics: [],
  comments: [],
  view: "overview",
  collection: "",
  collectionSearch: "",
  comicFilter: "all",
  ready: false
};

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

function showView(view) {
  state.view = view;
  const btn = $(`.admin-menu button[data-view="${view}"]`);
  $$(".admin-menu button").forEach(b => b.classList.toggle("is-active", b === btn));
  $$(".admin-view").forEach(v => v.classList.toggle("is-active", v.id === `view-${view}`));
  $("#view-title").textContent = btn.dataset.title;
  $("#view-sub").textContent = btn.dataset.sub;
  // The publish bar decides its own visibility: it follows unpublished work
  // around rather than living on two screens.
  setActiveView(view);
  if (view === "preview") onPreviewShown();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$$(".admin-menu button").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

/** Cross-links between views, so a pointer somewhere can open another screen. */
document.addEventListener("click", (e) => {
  const link = e.target.closest("[data-goto-view]");
  if (!link) return;
  e.preventDefault();
  showView(link.dataset.gotoView);
  const focus = link.dataset.gotoFocus;
  if (focus) setTimeout(() => $(focus)?.scrollIntoView({ behavior: "smooth", block: "center" }), 260);
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
/*  Collections — open one and work through everything inside it       */
/*                                                                     */
/*  The uploads and the pieces that shipped with the site used to be   */
/*  two separate panels, filtered independently. That meant no screen  */
/*  ever answered the obvious question -- what is actually in          */
/*  Paintings? -- and the shipped pieces, which are most of the        */
/*  gallery, could only be given a title. They are one list here, in   */
/*  the order visitors see them, and everything in it can be renamed,  */
/*  repictured, moved, hidden or deleted.                              */
/* ------------------------------------------------------------------ */

/** Collections that exist, whether from Firestore or the shipped folders. */
function collectionSlugs() {
  const fromCategories = state.artCategories
    .filter(c => c.slug !== "comics")
    .map(c => c.slug);
  const fromFolders = Object.keys(LOCAL_SEEDS)
    .filter(slug => (LOCAL_SEEDS[slug] || []).length && !CATEGORY_BY_SLUG[slug]?.isComics);
  return Array.from(new Set([...fromCategories, ...fromFolders]));
}

/** The placeholder the gallery shows for an unnamed bundled piece. */
function archivePlaceholder(slug, i) {
  const label = CATEGORY_BY_SLUG[slug]?.label || categoryName("art", slug);
  return `${label.replace(/s$/, "")} No. ${String(i + 1).padStart(2, "0")}`;
}

/**
 * True once the bundled pieces in this collection have records. Until then
 * there is nothing to delete, reorder or repoint -- only a title to attach.
 */
function archiveSeeded(slug) {
  return state.artworks.some(a => a.archive && a.category === slug && a.imageUrl);
}

/** The bundled pieces, from their records where those exist. */
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

/** The pieces the owner uploaded, newest first, as the site orders them. */
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

/** Everything in a collection, in the order the gallery page shows it. */
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
        <button class="btn is-small" data-edit>${piece.kind === "upload" || piece.title ? "Edit" : "Add a title"}</button>
        ${piece.managed ? `
          <button class="btn is-small" data-replace>Replace</button>
          ${piece.kind === "archive" ? `
            <button class="btn is-small" data-up ${piece.position === 0 ? "disabled" : ""} aria-label="Move earlier">&#9650;</button>
            <button class="btn is-small" data-down ${piece.position === archiveCount - 1 ? "disabled" : ""} aria-label="Move later">&#9660;</button>` : ""}
          <button class="btn is-small" data-visible>${piece.hidden ? "Show" : "Hide"}</button>
          <button class="btn is-small is-danger" data-del>Delete</button>` : ""}
      </div>
    `;

    $("[data-edit]", el).addEventListener("click", () => editPiece(piece));

    if (piece.managed) {
      $("[data-replace]", el).addEventListener("click", async () => {
        const next = await pickImage(piece.imageUrl);
        if (!next) return;
        const patch = { imageUrl: next, publicId: publicIdFromUrl(next) };
        if (piece.kind === "upload") await updateArtwork(piece.id, patch);
        else await replaceArchiveImage(piece.id, patch);
        toast("Picture replaced — its title, likes and comments are untouched.", "ok");
      });

      $("[data-visible]", el).addEventListener("click", async () => {
        await setArchiveVisibility(piece.id, piece.hidden);
        toast(piece.hidden ? "Back on the site." : "Hidden from the site — you can put it back.", "ok");
      });

      $("[data-del]", el).addEventListener("click", () => {
        confirmDelete({
          what: "piece",
          name: shown,
          extra: "Its likes and comments go with it. To take it off the site without losing them, use Hide instead.",
          onConfirm: async () => {
            await deleteArtwork(piece.id);
            toast("Piece deleted.", "ok");
          }
        });
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
}

/**
 * One editor for both kinds. An upload can also be moved to another
 * collection; a bundled piece cannot, because its place in the shipped folder
 * is what its number is derived from.
 */
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
  $("#collection-search").value = "";
  renderCollectionChips();
  renderCollection();
});

$("#collection-search")?.addEventListener("input", (e) => {
  state.collectionSearch = e.target.value;
  renderCollection();
});

/**
 * Gives the bundled pieces their records, from the panel where the owner
 * notices they are missing. It used to be reachable only as one step of a
 * "schema migration" under Maintenance, which is not somewhere anyone looking
 * for a delete button would ever think to open.
 */
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

/**
 * Copies a collection's bundled files into Cloudinary. Offered per collection
 * because it is roughly a hundred megabytes across all of them, and a folder
 * at a time is something you can start and watch finish.
 */
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
    // uploadAndRecord resolves the whole asset, not a URL. Taking `.url` is
    // not a tidy-up: the old code stored the object itself, so a story
    // published with new files ended up with "[object Object]" for every page.
    // Routing through uploadAndRecord also gives each page a media-library
    // record, without which its Cloudinary copy could never be deleted.
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

/* ------------------------------------------------------------------ */
/*  Boot                                                               */
/* ------------------------------------------------------------------ */

function boot() {
  // The bundled pieces come from the shipped folders rather than Firestore,
  // so a collection can be drawn immediately rather than waiting on a
  // snapshot.
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
    // The settings page needs one cover picker per collection, and the
    // preview needs every collection in its page list.
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

  // Settings and preview come up last: the preview frame loads a full copy of
  // the site, and there is no reason for that to compete with the panels the
  // owner is looking at first.
  initSettings().catch((err) => {
    console.error("Settings failed to load:", err);
    $("#settings-body").innerHTML =
      '<p class="empty-note">Settings could not be loaded. Check that the updated rules are published.</p>';
  });
  initPreview();
}
