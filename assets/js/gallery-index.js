import { fetchCategories } from "./data.js?v=20260823a";
import { CATEGORY_BY_SLUG, categoryHref, LOCAL_SEEDS, mergeCategories } from "./site-data.js?v=20260823a";
import { observeReveals, initNav } from "./reveal.js?v=20260823a";
import { escapeHtml, previewHref } from "./site-config.js?v=20260823a";

/* Looked up on mount rather than at import: the module outlives any one copy
   of the page now, so a reference captured here would point at DOM the router
   has already replaced. */
let grid = null;

/**
 * The seven cards used to be seven blocks of hand-written HTML: a cover image,
 * a name, and a blurb, none of which the owner could change. They are rendered
 * here instead, from the categories in Firestore and the cover images in
 * settings, so adding a collection or swapping a cover is a thing that happens
 * in the admin panel rather than in this file.
 *
 * The static markup is left in the page as the first paint and is only
 * replaced once real data has arrived, so a slow connection shows the gallery
 * rather than an empty grid.
 */

let latestConfig = null;
let latestCategories = null;

function coverFor(slug, config) {
  const chosen = config?.gallery?.covers?.[slug];
  if (chosen) return chosen;
  // A collection created in admin has no cover picked yet; fall back to the
  // first bundled image if it happens to be one of the shipped folders.
  return (LOCAL_SEEDS[slug] || [])[0] || "";
}

function card(category, config, index) {
  const cover = coverFor(category.slug, config);
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
  grid.innerHTML = latestCategories.map((c, i) => card(c, latestConfig, i)).join("");
  observeReveals(grid);
}

async function loadCategories() {
  const remote = await fetchCategories("art");
  // mergeCategories keeps the shipped labels, taglines and blurbs for the
  // seven built-in collections and layers anything set in admin on top, so an
  // untouched database still renders the site it always did.
  latestCategories = mergeCategories(remote).map(c => ({
    ...c,
    label: c.label || c.name,
    blurb: c.blurb || CATEGORY_BY_SLUG[c.slug]?.blurb || ""
  }));
  render();
}

export function mount() {
  grid = document.querySelector(".index-grid");
  initNav();
  observeReveals(document);
  render();
  loadCategories().catch(err => console.warn("Gallery index falling back to static cards.", err));
}

export function unmount() {
  grid = null;
}

export function onConfig(config) {
  latestConfig = config;
  render();
}
