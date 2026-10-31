import {
  initSiteConfig, paragraphs, escapeHtml, parseEmbed, applyBindings, updateState, timeAgo
} from "./site-config.js?v=20261031a";
import { posterFromVideo, videoDeliveryUrl } from "./cloudinary.js?v=20261031a";
import { renderAmbient } from "./ambient.js?v=20261031a";


let expiryTimer = null;

function videoMarkup(url, poster, duration, className) {
  const shownPoster = poster || posterFromVideo(url);
  const src = videoDeliveryUrl(url, { duration: Number(duration) || null });
  return `
    <div class="${className}">
      <video controls playsinline preload="metadata"${shownPoster ? ` poster="${escapeHtml(shownPoster)}"` : ""}>
        <source src="${escapeHtml(src)}">
      </video>
    </div>`;
}

export function renderUpdate(config) {
  const host = document.getElementById("update-banner");
  if (!host) return;

  const update = config.update;
  const state = updateState(update);

  host.hidden = !state.live;
  if (!state.live) {
    clearInterval(expiryTimer);
    expiryTimer = null;
    host.innerHTML = "";
    return;
  }

  const media = !update.mediaUrl ? ""
    : update.mediaType === "video"
      ? videoMarkup(update.mediaUrl, update.mediaPoster, update.mediaDuration, "update-media")
      : update.mediaType === "embed"
        ? (parseEmbed(update.mediaUrl)
          ? `<div class="update-media is-embed"><iframe src="${escapeHtml(parseEmbed(update.mediaUrl).src)}" title="Video" loading="lazy" allowfullscreen allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`
          : "")
        : `<div class="update-media"><img src="${escapeHtml(update.mediaUrl)}" alt="" loading="lazy"></div>`;

  host.innerHTML = `
    <div class="shell update-grid">
      <div class="update-copy">
        <p class="update-meta">
          <span class="update-dot" aria-hidden="true"></span>
          <time datetime="${escapeHtml(new Date(state.postedAt).toISOString())}">${timeAgo(state.postedAt)}</time>
        </p>
        ${paragraphs(update.text)}
        ${update.linkLabel && update.linkHref
          ? `<a class="link-btn" href="${escapeHtml(update.linkHref)}">${escapeHtml(update.linkLabel)} <span class="arrow">&#8594;</span></a>`
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
  const logo = (config.branding.logoUrl || "").trim();
  document.querySelectorAll(".wordmark-mark, .footer-logo").forEach((img) => {
    if (logo) {
      if (img.getAttribute("src") !== logo) img.src = logo;
      img.hidden = false;
    } else {
      img.removeAttribute("src");
      img.hidden = true;
    }
  });
}


let heroSignature = null;

export function renderHeroCanvas(config) {
  const canvas = document.querySelector(".hero-canvas");
  if (!canvas) return false;

  const images = (config.home.heroImages || []).filter(src => typeof src === "string" && src.trim());
  const signature = images.join("|");
  if (signature === heroSignature && canvas.dataset.painted === "1") return false;
  heroSignature = signature;
  canvas.dataset.painted = "1";

  canvas.innerHTML = images
    .map(src => `<img src="${escapeHtml(src)}" alt="" decoding="async">`)
    .join("");
  canvas.hidden = !images.length;
  return true;
}

export function renderHeroStats(config) {
  const host = document.querySelector(".hero-meta");
  if (!host) return;
  const stats = (config.home.heroStats || []).filter(s => (s.value || "").trim() || (s.label || "").trim());
  host.innerHTML = stats
    .map(s => `<div><span>${escapeHtml(s.value)}</span><small>${escapeHtml(s.label)}</small></div>`)
    .join("");
  host.hidden = !stats.length;
}

let storySignature = null;

export function renderHeroStory(config) {
  const host = document.querySelector(".hero-story");
  if (!host) return false;
  const lines = (config.home.heroStory || []).map(line => (typeof line === "string" ? line : line?.text || "")).filter(line => line.trim());
  const signature = lines.join("|");
  if (signature === storySignature && host.dataset.painted === "1") return false;
  storySignature = signature;
  host.dataset.painted = "1";
  host.innerHTML = lines.map(line => `<span>${escapeHtml(line)}</span>`).join("");
  return true;
}

export function renderLinks(config) {
  document.querySelectorAll("[data-cfg-link]").forEach((link) => {
    const label = String(readPath(config, link.dataset.cfgLink) || "");
    link.hidden = !label.trim();
  });
}

export function renderArtistCopy(config) {
  const host = document.querySelector("[data-artist-copy]");
  if (host) host.innerHTML = paragraphs(config.home.artistCopy);
}

export function renderStory(config) {
  const host = document.getElementById("story-section");
  if (!host) return;

  const story = config.story;
  const hasBody = (story.body || "").trim();
  host.hidden = story.enabled !== true || !hasBody;
  if (host.hidden) { host.innerHTML = ""; return; }

  placeStory(host, story.position);

  host.innerHTML = `
    <div class="shell story-grid">
      <div class="story-copy" data-reveal="left">
        ${story.eyebrow ? `<span class="eyebrow">${escapeHtml(story.eyebrow)}</span>` : ""}
        ${story.heading ? `<h2>${escapeHtml(story.heading)}</h2>` : ""}
        ${paragraphs(story.body)}
        ${story.ctaLabel && story.ctaHref
          ? `<a class="link-btn" href="${escapeHtml(story.ctaHref)}">${escapeHtml(story.ctaLabel)} <span class="arrow">&#8594;</span></a>`
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
    return videoMarkup(story.mediaUrl, story.mediaPoster, story.mediaDuration, "story-media is-video").replace('class="story-media is-video"', 'class="story-media is-video" data-reveal="right"');
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

function readPath(config, path) {
  return path.split(".").reduce((node, key) => (node == null ? undefined : node[key]), config);
}

export function renderBlocks(config) {
  document.querySelectorAll("[data-cfg-blocks]").forEach(host => renderBlockList(host, readPath(config, host.dataset.cfgBlocks)));
}

function renderBlockList(host, list) {
  const blocks = (Array.isArray(list) ? list : []).filter((block) => {
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

export function renderAboutFeature(config) {
  const feature = document.querySelector("[data-about-feature]");
  if (feature) feature.hidden = !(config.about.portrait || "").trim() && !(config.about.quote || "").trim();
}


function contactHref(item) {
  const href = (item.href || "").trim();
  if (href) return href;
  const value = (item.value || "").trim();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return `mailto:${value}`;
  if (/^\+?[\d\s()-]{6,}$/.test(value)) return `tel:${value.replace(/[^\d+]/g, "")}`;
  return "";
}

export function renderContact(config) {
  const items = document.getElementById("contact-items");
  const topics = document.getElementById("contact-topics");
  if (!items && !topics) return;
  const c = config.contact;

  if (items) {
    const list = (c.items || []).filter(i => (i.value || "").trim());
    items.innerHTML = list.map((item, i) => {
      const href = contactHref(item);
      const external = /^https?:/i.test(href);
      const body = `<small>${escapeHtml(item.label || "")}</small><b>${escapeHtml(item.value)}</b>`;
      return href
        ? `<a class="contact-card" href="${escapeHtml(href)}"${external ? ' target="_blank" rel="noopener"' : ""} data-reveal="scale" style="--reveal-delay:${i * 80}ms">${body}</a>`
        : `<div class="contact-card" data-reveal="scale" style="--reveal-delay:${i * 80}ms">${body}</div>`;
    }).join("");
    const article = items.closest("article");
    if (article) article.hidden = !list.length && !(c.heading || "").trim() && !(c.eyebrow || "").trim();
  }

  if (topics) {
    const list = (c.topics || []).map(t => (typeof t === "string" ? t : t?.title || "")).filter(t => t.trim());
    topics.innerHTML = list.map(t => `<li>${escapeHtml(t)}</li>`).join("");
    const article = topics.closest("article");
    if (article) article.hidden = !list.length && !(c.topicsHeading || "").trim();
  }
}


function setMeta(attr, key, value) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!value) { el?.remove(); return; }
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", value);
}

export function renderSeo(config) {
  const site = config.branding.siteTitle.trim();
  const path = document.body?.dataset.cfgDocTitle;
  const page = path ? String(readPath(config, path) || "").trim() : "";
  if (!document.body?.dataset.ownTitle) {
    const title = [page, site].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" | ");
    if (title) document.title = title;
  }

  const description = config.seo.description.trim();
  const image = config.seo.shareImage.trim();
  setMeta("name", "description", description);
  setMeta("property", "og:site_name", site);
  setMeta("property", "og:title", document.title);
  setMeta("property", "og:description", description);
  setMeta("property", "og:image", image);
  setMeta("name", "twitter:title", document.title);
  setMeta("name", "twitter:description", description);
  setMeta("name", "twitter:image", image);
  setMeta("name", "twitter:card", image ? "summary_large_image" : "summary");

  let ld = document.getElementById("site-ld");
  const name = config.home.artistName.trim();
  if (!site && !name) { ld?.remove(); return; }
  if (!ld) {
    ld = document.createElement("script");
    ld.type = "application/ld+json";
    ld.id = "site-ld";
    document.head.appendChild(ld);
  }
  const sameAs = (config.contact.items || []).map(contactHref).filter(h => /^https?:/i.test(h));
  const person = { "@type": "Person", "@id": `${location.origin}/#person`, name, url: `${location.origin}/about.html` };
  if (config.home.artistPortrait) person.image = config.home.artistPortrait;
  if (sameAs.length) person.sameAs = sameAs;
  ld.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      ...(name ? [person] : []),
      { "@type": "WebSite", "@id": `${location.origin}/#website`, url: `${location.origin}/`, name: site, description }
    ]
  });
}


let latest = null;

function paint(config) {
  latest = config;
  renderUpdate(config);
  renderBranding(config);
  renderHeroStats(config);
  renderLinks(config);
  renderArtistCopy(config);
  renderStory(config);
  renderBlocks(config);
  renderAboutFeature(config);
  renderContact(config);
  renderSeo(config);
  renderAmbient(config);
}

export function latestConfig() {
  return latest;
}

export function initContent(onConfig) {
  return initSiteConfig((config, meta) => {
    paint(config);
    onConfig?.(config, meta);
  });
}

export function repaintContent() {
  if (!latest) return;
  applyBindings(latest);
  paint(latest);
}
