import { $, $$, escapeHtml, toast } from "./admin-ui.js?v=20260823a";
import { categoryHref } from "./site-data.js?v=20260823a";

const DEVICES = {
  phone: { label: "Phone", width: 390, height: 844 },
  tablet: { label: "Tablet", width: 834, height: 1112 },
  desktop: { label: "Desktop", width: 1440, height: 900 }
};

const state = {
  device: "desktop",
  page: "index.html",
  mounted: false,
  pages: []
};

function basePages() {
  return [
    { href: "index.html", label: "Home" },
    { href: "gallery.html", label: "Gallery index" },
    { href: "comics.html", label: "Comics" },
    { href: "about.html", label: "About" },
    { href: "contact.html", label: "Contact" }
  ];
}

export function setPreviewCategories(categories) {
  state.pages = basePages().concat(
    categories.map(c => ({ href: categoryHref({ slug: c.slug }), label: c.name || c.slug }))
  );
  const seen = new Set();
  state.pages = state.pages.filter(p => !seen.has(p.href) && seen.add(p.href));
  if (state.mounted) renderPageSelect();
}

function renderPageSelect() {
  const select = $("#preview-page");
  if (!select) return;
  const pages = state.pages.length ? state.pages : basePages();
  select.innerHTML = pages
    .map(p => `<option value="${escapeHtml(p.href)}"${p.href === state.page ? " selected" : ""}>${escapeHtml(p.label)}</option>`)
    .join("");
}

function previewUrl() {
  const [path, query] = state.page.split("?");
  const params = new URLSearchParams(query || "");
  params.set("preview", "1");
  params.set("t", String(performance.now() | 0));
  return `${path}?${params.toString()}`;
}

function fitFrame() {
  const stage = $("#preview-stage");
  const frame = $("#preview-frame");
  if (!stage || !frame) return;

  const device = DEVICES[state.device];
  const available = stage.clientWidth - 2;
  const scale = Math.min(1, available / device.width);

  frame.style.width = `${device.width}px`;
  frame.style.height = `${device.height}px`;
  frame.style.transform = `scale(${scale})`;
  frame.parentElement.style.width = `${device.width * scale}px`;
  frame.parentElement.style.height = `${device.height * scale}px`;

  $("#preview-scale").textContent = scale < 1
    ? `${device.width}×${device.height} at ${Math.round(scale * 100)}%`
    : `${device.width}×${device.height}`;
}

export function refreshPreview() {
  const frame = $("#preview-frame");
  if (!frame) return;
  frame.src = previewUrl();
}

export function initPreview() {
  if (state.mounted) return;
  state.mounted = true;

  renderPageSelect();

  $("#preview-page").addEventListener("change", (e) => {
    state.page = e.target.value;
    refreshPreview();
  });

  $$("#preview-devices button").forEach((button) => {
    button.addEventListener("click", () => {
      state.device = button.dataset.device;
      $$("#preview-devices button").forEach(b => b.classList.toggle("is-active", b === button));
      fitFrame();
    });
  });

  $("#preview-reload").addEventListener("click", () => {
    refreshPreview();
    toast("Preview reloaded.", "ok");
  });

  $("#preview-open").addEventListener("click", () => {
    window.open(previewUrl(), "_blank", "noopener");
  });

  window.addEventListener("resize", fitFrame);

  fitFrame();
  refreshPreview();
}

export function onPreviewShown() {
  if (!state.mounted) return;
  fitFrame();
}
