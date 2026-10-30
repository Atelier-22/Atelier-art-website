import { mergeCategories, categoryHref } from "./site-data.js?v=20261030a";
import { previewHref, escapeHtml } from "./site-config.js?v=20261017b";

let pending = null;

function loadCategories() {
  pending ||= import("./data.js?v=20261030a")
    .then(({ fetchCategories }) => fetchCategories("art"))
    .then(mergeCategories)
    .catch((err) => {
      console.warn("Footer collections unavailable.", err);
      pending = null;
      return null;
    });
  return pending;
}

function links(list) {
  return list.map(c =>
    `<li><a href="${escapeHtml(previewHref(categoryHref(c)))}">${escapeHtml(c.label)}</a></li>`).join("");
}

export async function paintFooterCollections() {
  const categories = await loadCategories();
  if (!categories) return;
  const columns = document.querySelectorAll(".site-footer .footer-col ul");
  if (columns.length < 2) return;
  const split = Math.ceil(categories.length / 2);
  columns[0].innerHTML = links(categories.slice(0, split));
  columns[1].innerHTML = links(categories.slice(split))
    + `<li><a href="${escapeHtml(previewHref("about.html"))}">About the Artist</a></li>`;
  columns[0].closest(".footer-col").hidden = !split;
}
