import { fetchCategories, fetchCategoryCovers, watchContentDeletions, archivePieceId } from "./data.js?v=20261030a";
import { CATEGORY_BY_SLUG, categoryHref, LOCAL_SEEDS, mergeCategories } from "./site-data.js?v=20261030a";
import { observeReveals, initNav } from "./reveal.js?v=20260823a";
import { escapeHtml, previewHref, currentConfig } from "./site-config.js?v=20261017b";

let grid = null;


let latestConfig = null;
let latestCategories = null;
let uploadCovers = {};
let deletionSubscription = null;
let deletionSnapshotReady = false;
let deletedArtIds = new Set();
let deletedArtUrls = new Set();

function deletedUrl(url) {
  if (!url) return true;
  if (deletedArtUrls.has(url)) return true;
  for (const [slug, seeds] of Object.entries(LOCAL_SEEDS)) {
    const index = seeds.indexOf(url);
    if (index >= 0 && deletedArtIds.has(`art:${archivePieceId(slug, index)}`)) return true;
  }
  return false;
}

function coverFor(category, config) {
  if (!deletionSnapshotReady) return "";
  const own = category.cover;
  if (own && !deletedUrl(own)) return own;
  const chosen = config?.gallery?.covers?.[category.slug];
  if (chosen && !deletedUrl(chosen)) return chosen;
  return (LOCAL_SEEDS[category.slug] || []).find(src => !deletedUrl(src))
    || (uploadCovers[category.slug] && !deletedUrl(uploadCovers[category.slug]) ? uploadCovers[category.slug] : "");
}

function card(category, config, index) {
  const cover = coverFor(category, config);
  const isComics = category.slug === "comics";
  const label = category.label || category.name || category.slug;

  return `
    <a class="index-card" href="${escapeHtml(previewHref(categoryHref(category)))}"
       data-reveal="scale" style="--reveal-delay:${(index % 3) * 90}ms">
      ${cover ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(label)}" loading="lazy">` : ""}
      <span class="index-card-body">
        <h2>${escapeHtml(label)}</h2>
        <p>${escapeHtml(category.blurb || "A new collection.")}</p>
        <span class="go">${isComics ? "Enter the reading room" : "Explore"} &#8594;</span>
      </span>
    </a>`;
}

function render() {
  if (!grid || !latestCategories || !latestConfig) return;
  grid.innerHTML = latestCategories.length
    ? latestCategories.map((c, i) => card(c, latestConfig, i)).join("")
    : '<p class="index-empty">New collections are being prepared. Check back soon.</p>';
  observeReveals(grid);
}

async function loadCategories() {
  const [remote, covers] = await Promise.all([fetchCategories("art"), fetchCategoryCovers()]);
  uploadCovers = covers;
  latestCategories = mergeCategories(remote).map(c => ({
    ...c,
    label: c.label || c.name,
    blurb: c.blurb || CATEGORY_BY_SLUG[c.slug]?.blurb || ""
  }));
  render();
}

export function mount() {
  grid = document.querySelector(".index-grid");
  latestConfig ||= currentConfig();
  deletionSnapshotReady = false;
  deletedArtIds = new Set();
  deletedArtUrls = new Set();
  initNav();
  observeReveals(document);
  render();
  loadCategories().catch(err => console.warn("Gallery index falling back to static cards.", err));
  deletionSubscription = watchContentDeletions((items) => {
    deletedArtIds = new Set(items.filter(item => item.kind === "art").map(item => `art:${item.itemId}`));
    deletedArtUrls = new Set(items.filter(item => item.kind === "art" && item.imageUrl).map(item => item.imageUrl));
    deletionSnapshotReady = true;
    render();
  }, err => console.warn("Deleted artwork could not be loaded; hiding bundled covers.", err));
}

export function unmount() {
  deletionSubscription?.();
  deletionSubscription = null;
  grid = null;
}

export function onConfig(config) {
  latestConfig = config;
  render();
}
