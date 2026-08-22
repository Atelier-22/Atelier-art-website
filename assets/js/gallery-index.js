import { fetchCategories } from "./data.js?v=20260822b";
import { CATEGORY_BY_SLUG, categoryHref } from "./site-data.js?v=20260822b";
import { observeReveals, initNav } from "./reveal.js?v=20260822b";

const grid = document.querySelector(".index-grid");

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

/** Adds any category created in the admin panel that has no static page yet. */
async function appendCustomCategories() {
  if (!grid) return;
  const remote = await fetchCategories("art");
  const known = new Set(Object.keys(CATEGORY_BY_SLUG));
  const extras = remote.filter(c => !known.has(c.slug));
  if (!extras.length) return;

  extras.forEach((cat, i) => {
    const a = document.createElement("a");
    a.className = "index-card";
    a.href = categoryHref(cat);
    a.setAttribute("data-reveal", "scale");
    a.style.setProperty("--reveal-delay", `${(i % 3) * 90}ms`);
    a.innerHTML = `
      <span class="index-card-body">
        <h2>${escapeHtml(cat.name)}</h2>
        <p>${escapeHtml(cat.blurb || "A new collection.")}</p>
        <span class="go">Explore &#8594;</span>
      </span>
    `;
    grid.appendChild(a);
  });

  observeReveals(grid);
}

initNav();
observeReveals(document);
appendCustomCategories();
