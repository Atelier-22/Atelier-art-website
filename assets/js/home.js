import { DEFAULT_ART_CATEGORIES, LOCAL_SEEDS, mergeCategories, categoryHref } from "./site-data.js";
import { observeReveals, onScrollFrame, sectionProgress, initNav, prefersReducedMotion } from "./reveal.js";

const TILE_LAYOUT = ["t-hero", "t-tall", "t-strip", "t-strip", "t-strip"];
const FRAMES_PER_TILE = 3;
const HOVER_INTERVAL = 1600;
const PARALLAX_DEPTH = [0, 46, -30, 22, -18];

const pools = new Map();
let categories = DEFAULT_ART_CATEGORIES;

function spread(list, count) {
  if (list.length <= count) return list.slice();
  const step = list.length / count;
  return Array.from({ length: count }, (_, i) => list[Math.floor(i * step)]);
}

function toItem(src, category, title) {
  return { src, category, title: title || "Untitled" };
}

function seedPool(category) {
  return (category.seeds || LOCAL_SEEDS[category.slug] || []).map((src, i) =>
    toItem(src, category.label, `${category.label.replace(/s$/, "")} Study ${i + 1}`)
  );
}

function buildTile(category, layoutClass, tileIndex) {
  const tile = document.createElement("a");
  tile.className = `tile ${layoutClass}`;
  tile.href = categoryHref(category);
  tile.dataset.depth = String(PARALLAX_DEPTH[tileIndex] || 0);
  tile.setAttribute("aria-label", `View the ${category.label} collection`);

  const frames = document.createElement("div");
  frames.className = "tile-frames";

  const dots = document.createElement("div");
  dots.className = "tile-dots";

  const caption = document.createElement("div");
  caption.className = "tile-caption";
  caption.innerHTML = "<strong></strong><small></small>";

  tile.append(frames, dots, caption);
  tile._frames = frames;
  tile._dots = dots;
  tile._caption = caption;
  tile._index = 0;
  return tile;
}

function paintTile(tile, reel) {
  tile._reel = reel;
  tile._frames.innerHTML = "";
  tile._dots.innerHTML = "";

  if (!reel.length) {
    tile.classList.add("is-empty");
    return;
  }
  tile.classList.remove("is-empty");

  reel.forEach((item, i) => {
    const img = document.createElement("img");
    img.src = item.src;
    img.alt = item.title;
    img.loading = "lazy";
    img.decoding = "async";
    img.draggable = false;
    img.addEventListener("error", () => dropFrame(tile, img), { once: true });
    tile._frames.appendChild(img);

    const dot = document.createElement("i");
    tile._dots.appendChild(dot);
  });

  if (reel.length < 2) tile._dots.style.display = "none";
  setFrame(tile, 0);
}

function dropFrame(tile, img) {
  const i = Array.from(tile._frames.children).indexOf(img);
  if (i < 0) return;
  img.remove();
  tile._dots.children[i]?.remove();
  tile._reel.splice(i, 1);
  if (!tile._frames.children.length) {
    tile.classList.add("is-empty");
    return;
  }
  setFrame(tile, 0);
}

function setFrame(tile, index) {
  const imgs = tile._frames.children;
  if (!imgs.length) return;
  const next = ((index % imgs.length) + imgs.length) % imgs.length;
  if (tile._index === next && imgs[next].classList.contains("is-current")) return;
  tile._index = next;

  Array.from(imgs).forEach((img, i) => img.classList.toggle("is-current", i === next));
  Array.from(tile._dots.children).forEach((dot, i) => dot.classList.toggle("is-on", i === next));

  const item = tile._reel[next];
  if (item) {
    tile._caption.querySelector("strong").textContent = item.title;
    tile._caption.querySelector("small").textContent = item.category;
  }
}

function wireHover(tile) {
  const start = () => {
    if (prefersReducedMotion || tile._frames.children.length < 2) return;
    tile._hovering = true;
    clearInterval(tile._timer);
    tile._timer = setInterval(() => setFrame(tile, tile._index + 1), HOVER_INTERVAL);
  };
  const stop = () => {
    tile._hovering = false;
    clearInterval(tile._timer);
  };
  tile.addEventListener("pointerenter", start);
  tile.addEventListener("pointerleave", stop);
  tile.addEventListener("focus", start);
  tile.addEventListener("blur", stop);
}

function buildSection(category, index) {
  const section = document.createElement("section");
  section.className = "collection" + (index % 2 ? " is-flipped" : "");
  section.id = `collection-${category.slug}`;
  section.dataset.slug = category.slug;

  const inner = document.createElement("div");
  inner.className = "collection-inner";

  const intro = document.createElement("div");
  intro.className = "collection-intro";
  intro.setAttribute("data-reveal", index % 2 ? "right" : "left");
  intro.innerHTML = `
    <span class="collection-index">${String(index + 1).padStart(2, "0")} / ${String(categories.length).padStart(2, "0")}</span>
    <h2>${category.label}</h2>
    <p class="collection-tagline">${category.tagline}</p>
    <p class="blurb">${category.blurb}</p>
    <a class="link-btn" href="${categoryHref(category)}">Explore ${category.label} <span class="arrow">&#8594;</span></a>
    <span class="collection-count" data-count></span>
  `;

  const mosaic = document.createElement("div");
  mosaic.className = "mosaic";
  mosaic.setAttribute("data-stagger", "");

  const tiles = TILE_LAYOUT.map((layout, i) => {
    const tile = buildTile(category, layout, i);
    tile.setAttribute("data-reveal", "scale");
    tile.style.setProperty("--reveal-delay", `${i * 110}ms`);
    wireHover(tile);
    mosaic.appendChild(tile);
    return tile;
  });

  inner.append(intro, mosaic);
  section.appendChild(inner);

  section._tiles = tiles;
  section._category = category;
  return section;
}

function refreshSection(section) {
  const pool = pools.get(section.dataset.slug) || [];
  const picks = spread(pool, TILE_LAYOUT.length * FRAMES_PER_TILE);

  section._tiles.forEach((tile, i) => {
    const reel = [];
    for (let f = 0; f < FRAMES_PER_TILE; f++) {
      const item = picks[(i + f * TILE_LAYOUT.length) % picks.length];
      if (item && !reel.includes(item)) reel.push(item);
    }
    paintTile(tile, reel);
  });

  const countEl = section.querySelector("[data-count]");
  if (countEl) {
    countEl.textContent = pool.length
      ? `${pool.length} piece${pool.length === 1 ? "" : "s"} in this collection`
      : "";
  }
}

function wireScrollMotion(sections) {
  return onScrollFrame((vh) => {
    sections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      if (rect.bottom < -200 || rect.top > vh + 200) return;

      const p = sectionProgress(section, vh);
      section._tiles.forEach((tile, i) => {
        const depth = Number(tile.dataset.depth) || 0;
        if (depth) tile.style.transform = `translate3d(0, ${((p - 0.5) * depth).toFixed(2)}px, 0)`;

        if (tile._hovering) return;
        const frames = tile._frames.children.length;
        if (frames < 2) return;
        const offset = i * 0.17;
        setFrame(tile, Math.floor((p * 1.25 + offset) * frames) % frames);
      });
    });
  });
}

function wireHeroCanvas() {
  const canvas = document.querySelector(".hero-canvas");
  if (!canvas) return;
  const imgs = Array.from(canvas.querySelectorAll("img"));
  if (imgs.length < 2 || prefersReducedMotion) {
    imgs[0]?.classList.add("is-current");
    return;
  }
  let i = 0;
  imgs[0].classList.add("is-current");
  setInterval(() => {
    imgs[i].classList.remove("is-current");
    i = (i + 1) % imgs.length;
    imgs[i].classList.add("is-current");
  }, 6500);
}

async function upgradeFromFirestore(sections) {
  try {
    const { fetchUploadedArtworks } = await import("../../firebase-config.js");
    const byCategory = await fetchUploadedArtworks();
    let changed = false;

    sections.forEach((section) => {
      const uploaded = byCategory[section.dataset.slug];
      if (!uploaded?.length) return;
      const items = uploaded.map(a => toItem(a.imageUrl, section._category.label, a.title));
      pools.set(section.dataset.slug, [...items, ...(pools.get(section.dataset.slug) || [])]);
      refreshSection(section);
      changed = true;
    });

    if (changed) observeReveals(document);
  } catch (err) {
    console.warn("Live collection data unavailable, showing local archive.", err);
  }
}

function init() {
  initNav();

  const host = document.getElementById("collections");
  if (!host) return;

  let sections = mount(host);

  observeReveals(document);
  let detachScroll = wireScrollMotion(sections);
  wireHeroCanvas();
  upgradeFromFirestore(sections);

  loadCategoryOrder().then((remote) => {
    if (!remote || sameOrder(remote, categories)) return;
    categories = remote;
    detachScroll();
    host.innerHTML = "";
    sections = mount(host);
    observeReveals(document);
    detachScroll = wireScrollMotion(sections);
    upgradeFromFirestore(sections);
  });
}

function mount(host) {
  return categories.map((category, i) => {
    pools.set(category.slug, seedPool(category));
    const section = buildSection(category, i);
    host.appendChild(section);
    refreshSection(section);
    return section;
  });
}

function sameOrder(a, b) {
  return a.length === b.length && a.every((c, i) => c.slug === b[i].slug && c.label === b[i].label);
}

async function loadCategoryOrder() {
  try {
    const { fetchCategories } = await import("./data.js");
    return mergeCategories(await fetchCategories("art"));
  } catch (err) {
    console.warn("Category order unavailable, using defaults.", err);
    return null;
  }
}

init();
