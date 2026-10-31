import { categoryHref } from "./site-data.js?v=20261031a";
import { escapeHtml } from "./site-config.js?v=20261031a";
import { watchCategories } from "./data.js?v=20261031a";

let latest = [];

function links(list) {
  return list.map(c =>
    `<li><a href="${escapeHtml(categoryHref(c))}">${escapeHtml(c.name)}</a></li>`).join("");
}

export function paintFooterCollections() {
  const columns = document.querySelectorAll(".site-footer .footer-col ul");
  if (columns.length < 2) return;
  const split = Math.ceil(latest.length / 2);
  columns[0].innerHTML = links(latest.slice(0, split));
  columns[1].innerHTML = links(latest.slice(split));
  columns[0].closest(".footer-col").hidden = !split;
  columns[1].closest(".footer-col").hidden = latest.length < 2;
  document.querySelectorAll("[data-collection-marquee]").forEach((el) => {
    const names = latest.map(c => c.name).filter(Boolean);
    el.textContent = names.length ? `${names.join(" · ")} · `.repeat(2) : "";
    el.closest(".marquee").hidden = !names.length;
  });
}

export function startFooterCollections() {
  watchCategories("art", (items) => {
    latest = items;
    paintFooterCollections();
  });
  document.addEventListener("alafi:navigated", paintFooterCollections);
}
