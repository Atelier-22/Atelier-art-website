import {
  initSiteConfig, paragraphs, escapeHtml, previewHref, isPreview, parseEmbed,
  applyBindings, rewriteLinksForPreview, updateState, timeAgo
} from "./site-config.js?v=20260823a";
import { posterFromVideo, videoDeliveryUrl } from "./cloudinary.js?v=20260823a";
import { renderAmbient } from "./ambient.js?v=20260823a";


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


let expiryTimer = null;

export function renderUpdate(config) {
  const host = document.getElementById("update-banner");
  if (!host) return;

  const update = config.update || {};
  const state = updateState(update);

  host.hidden = !state.live;
  if (!state.live) {
    clearInterval(expiryTimer);
    expiryTimer = null;
    return;
  }

  const media = update.mediaUrl
    ? update.mediaType === "video"
      ? `<div class="update-media"><video controls playsinline preload="metadata"
             ${posterFromVideo(update.mediaUrl) ? `poster="${escapeHtml(posterFromVideo(update.mediaUrl))}"` : ""}>
           <source src="${escapeHtml(videoDeliveryUrl(update.mediaUrl))}"></video></div>`
      : `<div class="update-media"><img src="${escapeHtml(update.mediaUrl)}" alt="" loading="lazy"></div>`
    : "";

  host.innerHTML = `
    <div class="shell update-grid">
      <div class="update-copy">
        <p class="update-meta">
          <span class="update-dot" aria-hidden="true"></span>
          <span class="eyebrow">Studio update</span>
          <time datetime="${escapeHtml(new Date(state.postedAt).toISOString())}">${timeAgo(state.postedAt)}</time>
        </p>
        ${paragraphs(update.text)}
        ${update.linkLabel && update.linkHref
          ? `<a class="link-btn" href="${escapeHtml(previewHref(update.linkHref))}">${escapeHtml(update.linkLabel)} <span class="arrow">&#8594;</span></a>`
          : ""}
      </div>
      ${media}
    </div>
  `;

  if (!expiryTimer && Number.isFinite(state.remainingMs)) {
    expiryTimer = setInterval(() => renderUpdate(config), 60000);
  }
}


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


let heroSignature = "";

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


let latest = null;
let pageHook = null;

function paint(config, meta) {
  latest = config;
  renderPreviewBanner(meta);
  renderUpdate(config);
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

export function repaintContent() {
  if (!latest) return;
  applyBindings(latest);
  rewriteLinksForPreview();
  paint(latest, { source: "navigation" });
}
