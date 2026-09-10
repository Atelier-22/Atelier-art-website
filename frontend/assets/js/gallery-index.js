import { fetchCategories } from "./data.js?v=20260823a";
import { CATEGORY_BY_SLUG, categoryHref, LOCAL_SEEDS, mergeCategories } from "./site-data.js?v=20260823a";
import { observeReveals, initNav } from "./reveal.js?v=20260823a";
import { escapeHtml, previewHref } from "./site-config.js?v=20260823a";

let grid = null;


let latestConfig = null;
let latestCategories = null;

function coverFor(slug, config) {
  const chosen = config?.gallery?.covers?.[slug];
  if (chosen) return chosen;
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
