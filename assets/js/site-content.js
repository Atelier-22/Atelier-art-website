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
  initSiteConfig, paragraphs, escapeHtml, previewHref, isPreview, parseEmbed,
  applyBindings, rewriteLinksForPreview
} from "./site-config.js?v=20260823a";
import { posterFromVideo, videoDeliveryUrl } from "./cloudinary.js?v=20260823a";
import { renderAmbient } from "./ambient.js?v=20260823a";

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
    bar.dataset.persist = "";
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

  placeStory(host, story.position);

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

/**
 * Moves the story section to where the owner wants it.
 *
 * At the top it sits above the hero, so a new story is the first thing a
 * visitor meets rather than something they have to know to scroll for. The
 * section is moved rather than duplicated, so there is only ever one of it
 * and switching back and forth costs nothing.
 */
function placeStory(host, position) {
  const hero = document.querySelector(".hero");
  const artist = document.querySelector(".artist");
  const atTop = position !== "artist";

  host.classList.toggle("is-leading", atTop);

  if (atTop && hero && hero.previousElementSibling !== host) {
    hero.parentNode.insertBefore(host, hero);
  } else if (!atTop && artist && artist.nextElementSibling !== host) {
    artist.parentNode.insertBefore(host, artist.nextSibling);
  }
}

/**
 * Three kinds of media, one slot.
 *
 * A hosted video is served at automatic quality and starts as a still —
 * `preload="metadata"` fetches a few kilobytes of header rather than the whole
 * clip, so a visitor who never presses play costs almost nothing. On a site
 * whose whole video budget is a shared monthly allowance, that is the
 * difference between affordable and not.
 */
function storyMedia(story) {
  if (!story.mediaUrl) return "";

  if (story.mediaType === "embed") {
    const embed = parseEmbed(story.mediaUrl);
    if (!embed) return "";
    return `
      <div class="story-media is-embed" data-reveal="right">
        <iframe src="${escapeHtml(embed.src)}" title="${escapeHtml(story.heading || "Video")}"
                loading="lazy" allowfullscreen
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                referrerpolicy="strict-origin-when-cross-origin"></iframe>
      </div>`;
  }

  if (story.mediaType === "video") {
    const poster = story.mediaPoster || posterFromVideo(story.mediaUrl);
    const src = videoDeliveryUrl(story.mediaUrl, { duration: Number(story.mediaDuration) || null });
    return `
      <div class="story-media is-video" data-reveal="right">
        <video controls playsinline preload="metadata"
               ${poster ? `poster="${escapeHtml(poster)}"` : ""}>
          <source src="${escapeHtml(src)}">
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
let latest = null;
let pageHook = null;

function paint(config, meta) {
  latest = config;
  renderPreviewBanner(meta);
  renderBranding(config);
  renderHeroStats(config);
  renderArtistCopy(config);
  renderStory(config);
  renderAboutBlocks(config);
  renderAmbient(config);
}

export function initContent(onConfig) {
  pageHook = onConfig;
  return initSiteConfig((config, meta) => {
    paint(config, meta);
    pageHook?.(config, meta);
  });
}

/**
 * Re-applies the config to freshly swapped DOM.
 *
 * After the router replaces the body there is a new nav to brand, new bound
 * fields to fill and a new story section to build — but the same config, and
 * the same subscription. Repainting is not re-subscribing.
 */
export function repaintContent() {
  if (!latest) return;
  applyBindings(latest);
  rewriteLinksForPreview();
  paint(latest, { source: "navigation" });
}
