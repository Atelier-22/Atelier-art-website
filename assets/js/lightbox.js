let overlay = null;
let state = { items: [], index: 0, open: false };
let lastFocus = null;

function build() {
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.className = "lightbox";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Artwork viewer");
  overlay.hidden = true;
  overlay.dataset.persist = "";
  overlay.innerHTML = `
    <button class="lb-close" type="button" aria-label="Close viewer">&times;</button>
    <button class="lb-arrow lb-prev" type="button" aria-label="Previous">&#10094;</button>
    <figure class="lb-stage">
      <img class="lb-image" alt="">
      <figcaption class="lb-caption">
        <strong class="lb-title"></strong>
        <span class="lb-meta"></span>
      </figcaption>
    </figure>
    <button class="lb-arrow lb-next" type="button" aria-label="Next">&#10095;</button>
    <div class="lb-counter"></div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector(".lb-close").addEventListener("click", close);
  overlay.querySelector(".lb-prev").addEventListener("click", () => step(-1));
  overlay.querySelector(".lb-next").addEventListener("click", () => step(1));
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  let startX = 0;
  overlay.addEventListener("touchstart", (e) => { startX = e.touches[0].clientX; }, { passive: true });
  overlay.addEventListener("touchend", (e) => {
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 55) step(dx < 0 ? 1 : -1);
  }, { passive: true });

  return overlay;
}

function render() {
  const item = state.items[state.index];
  if (!item) return;

  const img = overlay.querySelector(".lb-image");
  img.classList.remove("is-loaded");
  img.src = item.src;
  img.alt = item.title || "Artwork";
  img.decode?.().catch(() => {}).finally(() => img.classList.add("is-loaded"));

  overlay.querySelector(".lb-title").textContent = item.title || "";
  overlay.querySelector(".lb-meta").textContent = item.meta || "";
  overlay.querySelector(".lb-counter").textContent =
    state.items.length > 1 ? `${state.index + 1} / ${state.items.length}` : "";

  const single = state.items.length < 2;
  overlay.querySelector(".lb-prev").hidden = single;
  overlay.querySelector(".lb-next").hidden = single;
}

function step(delta) {
  if (!state.items.length) return;
  state.index = (state.index + delta + state.items.length) % state.items.length;
  render();
}

function onKey(e) {
  if (!state.open) return;
  if (e.key === "Escape") close();
  else if (e.key === "ArrowLeft") step(-1);
  else if (e.key === "ArrowRight") step(1);
}

export function open(items, index = 0) {
  if (!items?.length) return;
  build();
  state = { items, index, open: true };
  lastFocus = document.activeElement;

  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add("is-open"));
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", onKey);
  render();
  overlay.querySelector(".lb-close").focus();
}

export function close() {
  if (!overlay || !state.open) return;
  state.open = false;
  overlay.classList.remove("is-open");
  document.body.style.overflow = "";
  document.removeEventListener("keydown", onKey);
  setTimeout(() => { if (!state.open) overlay.hidden = true; }, 400);
  lastFocus?.focus?.();
}

/**
 * Binds a container once. Clicks are resolved at event time against a live
 * getter, so images injected after binding open correctly — the original
 * implementation snapshotted a NodeList at parse time and could never see them.
 */
export function bindGallery(container, getItems, selector = "[data-lightbox]") {
  if (!container || container.dataset.lightboxBound === "1") return;
  container.dataset.lightboxBound = "1";

  container.addEventListener("click", (e) => {
    const trigger = e.target.closest(selector);
    if (!trigger || !container.contains(trigger)) return;
    e.preventDefault();

    const items = getItems();
    const id = trigger.dataset.lightbox;
    const index = items.findIndex(item => item.id === id);
    open(items, index < 0 ? 0 : index);
  });
}
