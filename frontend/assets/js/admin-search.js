import { $, $$, escapeHtml } from "./admin-ui.js?v=20261027e";
import { settingsSearchIndex, openSetting } from "./admin-settings.js?v=20261030a";

const VIEW_KEYWORDS = {
  overview: "home dashboard stats summary recent",
  artworks: "upload photos pictures images paintings pieces art collection replace hide",
  comics: "stories pages upload comic book",
  categories: "collections genres rebuild create add delete rename reorder sort cover",
  settings: "configure options",
  preview: "draft see view check before publish",
  maintenance: "migration admin identity tools repair",
  engagement: "likes comments visitors feedback reactions"
};

const MAX_RESULTS = 12;

let input;
let list;
let results = [];
let active = 0;
let deps;

function normalise(text) {
  return (text || "").toString().toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

function viewEntries() {
  return $$(".admin-menu button[data-view]").map(btn => ({
    title: btn.dataset.title,
    context: "Page",
    keywords: `${btn.dataset.sub || ""} ${VIEW_KEYWORDS[btn.dataset.view] || ""}`,
    run: () => deps.showView(btn.dataset.view)
  }));
}

function actionEntries() {
  const focus = (view, selector) => () => {
    deps.showView(view);
    return selector;
  };
  return [
    { title: "Upload artwork", context: "Action", keywords: "add new photo picture image piece", run: focus("artworks", "#art-drop") },
    { title: "Add a gallery collection", context: "Action", keywords: "new category create build", run: focus("categories", "#art-cat-name") },
    { title: "Add a comic genre", context: "Action", keywords: "new category create", run: focus("categories", "#comic-cat-name") },
    { title: "Restore built-in collections", context: "Action", keywords: "rebuild reset default categories original", run: focus("categories", "#art-cat-restore") },
    { title: "Publish changes", context: "Action", keywords: "go live save settings", run: focus("settings", "#publish-bar") },
    { title: "Publish a comic", context: "Action", keywords: "new story upload", run: focus("comics", "#comic-form") }
  ];
}

function dataEntries() {
  const { artCategories, comicCategories, comics } = deps.getData();
  return [
    ...artCategories.flatMap(c => [{
      title: c.name,
      context: "Gallery collection › name, text and cover",
      keywords: `${c.slug} ${c.tagline} category edit rename`,
      run: () => { deps.showView("categories"); return `#art-cat-rows [data-selection-key="${CSS.escape(c.id)}"]`; }
    }, {
      title: `${c.name} pictures`,
      context: "Artworks › collection",
      keywords: `${c.slug} photos images upload artwork`,
      run: () => { deps.openCollection(c.slug); return "#collection-panel"; }
    }]),
    ...comicCategories.map(c => ({
      title: c.name,
      context: "Comic genre",
      keywords: `${c.slug} ${c.tagline} category`,
      run: () => { deps.showView("categories"); return `#comic-cat-rows [data-selection-key="${CSS.escape(c.id)}"]`; }
    })),
    ...comics.map(c => ({
      title: c.title,
      context: "Comic",
      keywords: `${c.categorySlug} story`,
      run: () => { deps.showView("comics"); return "#comic-grid"; }
    }))
  ];
}

function settingEntries() {
  return settingsSearchIndex().map(entry => ({
    ...entry,
    run: async () => {
      deps.showView("settings");
      return openSetting(entry.tab, entry.group, entry.field);
    }
  }));
}

function score(entry, terms) {
  const title = normalise(entry.title);
  const context = normalise(entry.context);
  const keywords = normalise(entry.keywords);
  let total = 0;
  for (const term of terms) {
    if (title.startsWith(term)) total += 12;
    else if (title.split(/\s+/).some(word => word.startsWith(term))) total += 8;
    else if (title.includes(term)) total += 6;
    else if (context.includes(term)) total += 3;
    else if (keywords.split(/[^a-z0-9]+/).some(word => word.startsWith(term))) total += 2;
    else return 0;
  }
  return total - (entry.field !== undefined ? 0.5 : 0);
}

function search(text) {
  const terms = normalise(text).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return [...actionEntries(), ...viewEntries(), ...dataEntries(), ...settingEntries()]
    .map(entry => ({ entry, score: score(entry, terms) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)
    .map(item => item.entry);
}

function render() {
  if (!results.length) {
    list.innerHTML = input.value.trim()
      ? '<p class="admin-search-empty">Nothing matches. Try a word like “logo”, “colours”, “music” or a collection name.</p>'
      : "";
    list.hidden = !input.value.trim();
    input.setAttribute("aria-expanded", String(!list.hidden));
    return;
  }
  list.innerHTML = results.map((entry, i) => `
    <button type="button" role="option" class="admin-search-hit${i === active ? " is-active" : ""}" data-hit="${i}" aria-selected="${i === active}">
      <span class="hit-title">${escapeHtml(entry.title)}</span>
      <small>${escapeHtml(entry.context)}</small>
    </button>`).join("");
  list.hidden = false;
  input.setAttribute("aria-expanded", "true");
  $(".is-active", list)?.scrollIntoView({ block: "nearest" });
}

function close() {
  results = [];
  active = 0;
  list.hidden = true;
  input.setAttribute("aria-expanded", "false");
}

function highlight(target) {
  const el = typeof target === "string" ? $(target) : target;
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("is-found");
  void el.offsetWidth;
  el.classList.add("is-found");
  setTimeout(() => el.classList.remove("is-found"), 2400);
  const field = el.matches("input, select, textarea") ? el : $("input:not([type=hidden]), select, textarea", el);
  if (field && !field.disabled) setTimeout(() => field.focus({ preventScroll: true }), 300);
}

async function choose(entry) {
  if (!entry) return;
  input.value = "";
  close();
  input.blur();
  const target = await entry.run();
  if (target) setTimeout(() => highlight(target), 280);
}

export function initAdminSearch(options) {
  deps = options;
  input = $("#admin-search");
  list = $("#admin-search-results");
  if (!input || !list) return;

  input.addEventListener("input", () => {
    results = search(input.value);
    active = 0;
    render();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && results.length) { e.preventDefault(); active = (active + 1) % results.length; render(); }
    else if (e.key === "ArrowUp" && results.length) { e.preventDefault(); active = (active - 1 + results.length) % results.length; render(); }
    else if (e.key === "Enter") { e.preventDefault(); choose(results[active]); }
    else if (e.key === "Escape") { e.stopPropagation(); input.value = ""; close(); input.blur(); }
  });

  input.addEventListener("focus", () => {
    if (!input.value.trim()) return;
    results = search(input.value);
    render();
  });

  list.addEventListener("mousedown", e => e.preventDefault());
  list.addEventListener("click", (e) => {
    const hit = e.target.closest("[data-hit]");
    if (hit) choose(results[Number(hit.dataset.hit)]);
  });

  input.addEventListener("blur", () => setTimeout(close, 120));

  document.addEventListener("keydown", (e) => {
    const typing = e.target.closest?.("input, textarea, select, [contenteditable]");
    const shortcut = (e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey);
    if (!shortcut && (e.key !== "/" || typing)) return;
    if (document.querySelector(".modal.is-open")) return;
    e.preventDefault();
    input.focus();
    input.select();
  });
}
