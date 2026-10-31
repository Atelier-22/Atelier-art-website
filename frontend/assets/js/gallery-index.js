import { watchCategories } from "./data.js?v=20261031a";
import { categoryHref } from "./site-data.js?v=20261031a";
import { observeReveals, initNav } from "./reveal.js?v=20261031a";
import { escapeHtml } from "./site-config.js?v=20261031a";

let grid = null;
let stop = null;

function card(category, index) {
  const cover = (category.cover || "").trim();
  return `
    <a class="index-card${cover ? "" : " is-coverless"}" href="${escapeHtml(categoryHref(category))}"
       data-slug="${escapeHtml(category.slug)}" data-reveal="scale" style="--reveal-delay:${(index % 3) * 90}ms">
      ${cover ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(category.name)}" loading="lazy">` : ""}
      <span class="index-card-body">
        <h2>${escapeHtml(category.name)}</h2>
        ${category.blurb ? `<p>${escapeHtml(category.blurb)}</p>` : ""}
        <span class="go">&#8594;</span>
      </span>
    </a>`;
}

function render(categories) {
  if (!grid) return;
  grid.innerHTML = categories.map(card).join("");
  const empty = document.getElementById("gallery-index-empty");
  if (empty) empty.hidden = categories.length > 0;
  observeReveals(grid);
}

export function mount() {
  grid = document.querySelector(".index-grid");
  initNav();
  observeReveals(document);
  stop = watchCategories("art", render);
}

export function unmount() {
  try { stop?.(); } catch (err) { console.error("Gallery index listener could not be stopped.", err); }
  stop = null;
  grid = null;
}

export function onConfig() {
  observeReveals(document);
}
