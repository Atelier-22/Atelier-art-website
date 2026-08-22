/**
 * Turns a site config into the parts of a page that are not a single string.
 *
 * The scalar fields bind themselves through `data-cfg-*` attributes in the
 * markup (see site-config.js). What is left is the repeated content — the hero
 * reel, the story blocks, the figures — plus the preview banner. Each renderer
 * is idempotent and cheap to call again, because a config change arrives as a
 * fresh snapshot rather than a diff.
 */

import {
  initSiteConfig, paragraphs, escapeHtml, previewHref, isPreview
} from "./site-config.js?v=20260823a";

/* ------------------------------------------------------------------ */
/*  Preview banner                                                     */
/* ------------------------------------------------------------------ */

/**
 * States plainly that what is on screen is not what the public sees. Without
 * it, a preview tab left open for ten minutes is indistinguishable from the
 * live site, and the next edit gets made against the wrong thing.
 */
function renderPreviewBanner(meta) {
  if (!isPreview()) return;
  let bar = document.getElementById("preview-banner");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "preview-banner";
    bar.className = "preview-banner";
    document.body.appendChild(bar);
    document.body.classList.add("is-previewing");
  }
  bar.textContent = meta?.deniedDraft
    ? "Preview unavailable — showing the live site. Sign in as the owner to see drafts."
    : "Preview — unpublished draft. Visitors still see the live site.";
  bar.classList.toggle("is-denied", !!meta?.deniedDraft);
}

/* ------------------------------------------------------------------ */
/*  Branding                                                           */
/* ------------------------------------------------------------------ */

/**
 * The wordmark is text until the owner uploads a logo, at which point it
 * becomes the logo everywhere at once. Both forms keep the link, so the header
 * still gets you home.
 */
export function renderBranding(config) {
  const logo = (config.branding?.logoUrl || "").trim();

  document.querySelectorAll(".wordmark").forEach((mark) => {
    const hasLogo = !!logo;
    mark.classList.toggle("has-logo", hasLogo);

    if (!hasLogo) {
      if (mark.dataset.logoMounted) {
        mark.innerHTML = `<b data-cfg-text="branding.wordmark">${escapeHtml(config.branding?.wordmark || "")}</b><span data-cfg-text="branding.wordmarkDot">${escapeHtml(config.branding?.wordmarkDot || "")}</span>`;
        delete mark.dataset.logoMounted;
      }
      return;
    }

    const img = mark.querySelector("img");
    if (img) {
      if (img.getAttribute("src") !== logo) img.src = logo;
      return;
    }
    mark.innerHTML = `<img src="${escapeHtml(logo)}" alt="${escapeHtml(config.branding?.siteTitle || "Home")}">`;
    mark.dataset.logoMounted = "1";
  });
}

/* ------------------------------------------------------------------ */
/*  Homepage                                                           */
/* ------------------------------------------------------------------ */

let heroSignature = "";

/**
 * Rebuilds the hero reel only when the picture list actually changes. The
 * slideshow owns a timer and a "current" class, so rebuilding it on every
 * snapshot would stack intervals and make the fade stutter.
 *
 * Returns true when the DOM was replaced, so the caller knows to re-wire.
 */
export function renderHeroCanvas(config) {
  const canvas = document.querySelector(".hero-canvas");
  if (!canvas) return false;

  const images = (config.home?.heroImages || []).filter(Boolean);
  if (!images.length) return false;

  const signature = images.join("|");
  if (signature === heroSignature) return false;
  heroSignature = signature;

  canvas.innerHTML = images
    .map(src => `<img src="${escapeHtml(src)}" alt="" decoding="async">`)
    .join("");
  return true;
}

export function renderHeroStats(config) {
  const host = document.querySelector(".hero-meta");
  if (!host) return;
  const stats = config.home?.heroStats || [];
  host.innerHTML = stats
    .map(s => `<div><span>${escapeHtml(s.value)}</span><small>${escapeHtml(s.label)}</small></div>`)
    .join("");
}

export function renderArtistCopy(config) {
  const host = document.querySelector(".artist-copy [data-artist-copy]");
  if (host) host.innerHTML = paragraphs(config.home?.artistCopy);
}

/**
 * The story section, sitting under the Alafi block. It is a full section that
 * appears and disappears with a single switch in settings, so the owner can
 * take it down without leaving an empty heading behind.
 */
export function renderStory(config) {
  const host = document.getElementById("story-section");
  if (!host) return;

  const story = config.story || {};
  const hasBody = (story.body || "").trim();
  host.hidden = story.enabled === false || !hasBody;
  if (host.hidden) return;

  host.innerHTML = `
    <div class="shell story-grid">
      <div class="story-copy" data-reveal="left">
        ${story.eyebrow ? `<span class="eyebrow">${escapeHtml(story.eyebrow)}</span>` : ""}
        ${story.heading ? `<h2>${escapeHtml(story.heading)}</h2>` : ""}
        ${paragraphs(story.body)}
        ${story.ctaLabel && story.ctaHref
          ? `<a class="link-btn" href="${escapeHtml(previewHref(story.ctaHref))}">${escapeHtml(story.ctaLabel)} <span class="arrow">&#8594;</span></a>`
          : ""}
      </div>
      ${storyMedia(story)}
    </div>
  `;
}

function storyMedia(story) {
  if (!story.mediaUrl) return "";

  if (story.mediaType === "video") {
    return `
      <div class="story-media" data-reveal="right">
        <video controls playsinline preload="metadata"
               ${story.mediaPoster ? `poster="${escapeHtml(story.mediaPoster)}"` : ""}>
          <source src="${escapeHtml(story.mediaUrl)}">
        </video>
      </div>`;
  }

  return `
    <div class="story-media" data-reveal="right">
      <img src="${escapeHtml(story.mediaUrl)}" alt="" loading="lazy">
    </div>`;
}

/* ------------------------------------------------------------------ */
/*  About page                                                         */
/* ------------------------------------------------------------------ */

/**
 * The About page's blocks, each rendered according to its declared type. The
 * markup produced here is byte-for-byte the shape the hand-written page used,
 * so prose.css needed no changes — this only moves who decides what goes in
 * it.
 */
const BLOCK_BODY = {
  prose: () => "",

  steps: (items) => `
    <ol class="step-list">
      ${items.map((item, i) => `
        <li data-reveal="scale"${i ? ` style="--reveal-delay:${i * 90}ms"` : ""}>
          <b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.text || "")}</span>
        </li>`).join("")}
    </ol>`,

  timeline: (items) => `
    <ol class="timeline">
      ${items.map((item, i) => `
        <li data-reveal="left"${i ? ` style="--reveal-delay:${i * 80}ms"` : ""}>
          <b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.text || "")}</span>
        </li>`).join("")}
    </ol>`,

  tags: (items) => `
    <ul class="tag-cloud">
      ${items.map(item => `<li>${escapeHtml(item.title)}</li>`).join("")}
    </ul>`,

  figures: (items) => `
    <div class="figure-row">
      ${items.map(item => `<div><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.text || "")}</small></div>`).join("")}
    </div>`
};

export function renderAboutBlocks(config) {
  const host = document.getElementById("about-blocks");
  if (!host) return;

  const blocks = (config.about?.blocks || []).filter((block) => {
    const items = (block.items || []).filter(i => (i.title || "").trim());
    return (block.heading || "").trim() || (block.body || "").trim() || items.length;
  });

  host.innerHTML = blocks.map((block) => {
    const items = (block.items || []).filter(i => (i.title || "").trim());
    const renderItems = BLOCK_BODY[block.type] || BLOCK_BODY.prose;
    return `
      <article class="prose" data-reveal>
        ${block.eyebrow ? `<span class="eyebrow">${escapeHtml(block.eyebrow)}</span>` : ""}
        ${block.heading ? `<h2>${escapeHtml(block.heading)}</h2>` : ""}
        ${paragraphs(block.body)}
        ${items.length ? renderItems(items) : ""}
      </article>`;
  }).join("");
}

/* ------------------------------------------------------------------ */
/*  Entry point                                                        */
/* ------------------------------------------------------------------ */

/**
 * One call for a public page: applies the theme, binds the scalar fields,
 * renders the repeated content, then keeps doing it as the config changes.
 * The callback runs afterwards so a page can do its own extra work.
 */
export function initContent(onConfig) {
  return initSiteConfig((config, meta) => {
    renderPreviewBanner(meta);
    renderBranding(config);
    renderHeroStats(config);
    renderArtistCopy(config);
    renderStory(config);
    renderAboutBlocks(config);
    onConfig?.(config, meta);
  });
}
