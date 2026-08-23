/**
 * Site configuration — the single record behind everything the owner can
 * change without a developer: colours, fonts, branding, the copy that used to
 * be typed into the HTML, and the images that used to be hard-coded next to
 * it.
 *
 * Two documents, never one:
 *
 *   siteConfig/draft      what the owner is editing. Admin-only by rule, so a
 *                         visitor cannot see an unfinished change.
 *   siteConfig/published  what the public site renders.
 *
 * Every edit lands in the draft. Publishing copies the draft over the top of
 * published in a single write. That split is what makes preview real: the
 * preview loads the actual site pages with `?preview=1`, and those pages read
 * the draft instead of published. Nothing is simulated, and nothing is
 * deployed to look at it.
 */

import { db } from "../../firebase-config.js?v=20260823a";
import {
  doc, getDoc, setDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { mix, alpha, lighten, contrast, readableOn, isHex } from "./color.js?v=20260823a";

export const CONFIG_CACHE_KEY = "alafi_site_config";
export const THEME_CACHE_KEY = "alafi_theme_css";

/* ------------------------------------------------------------------ */
/*  Fonts — a curated pairing list, not a free-text field              */
/* ------------------------------------------------------------------ */

export const DISPLAY_FONTS = {
  cormorant: { label: "Cormorant Garamond", stack: '"Cormorant Garamond", "Iowan Old Style", Georgia, serif', google: "Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400" },
  playfair:  { label: "Playfair Display",   stack: '"Playfair Display", Georgia, serif',                      google: "Playfair+Display:ital,wght@0,400;0,500;0,600;1,400" },
  libre:     { label: "Libre Baskerville",  stack: '"Libre Baskerville", Georgia, serif',                     google: "Libre+Baskerville:ital,wght@0,400;0,700;1,400" },
  marcellus: { label: "Marcellus",          stack: '"Marcellus", Georgia, serif',                             google: "Marcellus" },
  spectral:  { label: "Spectral",           stack: '"Spectral", Georgia, serif',                              google: "Spectral:ital,wght@0,300;0,400;0,500;1,300" },
  syne:      { label: "Syne (modern)",      stack: '"Syne", "Helvetica Neue", sans-serif',                    google: "Syne:wght@400;600;700" }
};

export const BODY_FONTS = {
  inter:     { label: "Inter",        stack: '"Inter", "Helvetica Neue", Arial, sans-serif',      google: "Inter:wght@300;400;500" },
  worksans:  { label: "Work Sans",    stack: '"Work Sans", "Helvetica Neue", Arial, sans-serif',  google: "Work+Sans:wght@300;400;500" },
  dmsans:    { label: "DM Sans",      stack: '"DM Sans", "Helvetica Neue", Arial, sans-serif',    google: "DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500" },
  karla:     { label: "Karla",        stack: '"Karla", "Helvetica Neue", Arial, sans-serif',      google: "Karla:wght@300;400;500" },
  jost:      { label: "Jost",         stack: '"Jost", "Helvetica Neue", Arial, sans-serif',       google: "Jost:wght@300;400;500" },
  sourceserif: { label: "Source Serif (serif body)", stack: '"Source Serif 4", Georgia, serif',    google: "Source+Serif+4:opsz,wght@8..60,300;8..60,400;8..60,500" }
};

export function googleFontHref(displayKey, bodyKey) {
  const d = DISPLAY_FONTS[displayKey] || DISPLAY_FONTS.cormorant;
  const b = BODY_FONTS[bodyKey] || BODY_FONTS.inter;
  return `https://fonts.googleapis.com/css2?family=${d.google}&family=${b.google}&display=swap`;
}

/* ------------------------------------------------------------------ */
/*  Defaults — deliberately identical to the current hand-written site */
/* ------------------------------------------------------------------ */

export const DEFAULT_CONFIG = {
  version: 1,

  theme: {
    bg: "#e6dfd1",
    bgRaised: "#faf7f1",
    fg: "#14120e",
    gold: "#7d6018",
    goldFill: "#c8a349",
    danger: "#9d332d",
    ok: "#2c6647",
    displayFont: "cormorant",
    bodyFont: "inter",
    gutter: 80,   /* px, the upper bound of the clamp */
    measure: 1440 /* px, max content width */
  },

  branding: {
    wordmark: "Alafi",
    wordmarkDot: ".",
    logoUrl: "",
    siteTitle: "Alafi Art Work",
    footerBlurb: "A digital gallery of original work — built to be wandered through slowly.",
    copyright: "© 2026 Alafi Art Work",
    rights: "All rights reserved"
  },

  home: {
    heroEyebrow: "A Digital Exhibition — Est. 2026",
    heroLine1: "Every piece",
    heroLine2: "is a <em>room</em>",
    heroLine3: "you walk into.",
    heroBlurb: "Seven collections by Alafi Jonathan — paint, graphite, pixel, and stone. Take your time. The gallery reveals itself as you go.",
    heroStats: [
      { value: "07", label: "Collections" },
      { value: "120+", label: "Works" },
      { value: "∞", label: "Looking" }
    ],
    heroImages: ["1.jpg", "artworks/paintings/painting7.jpg", "artworks/portraits/portrait4.jpg", "2.jpg"],
    manifesto: "Art holds what words <b>can't</b> — it slows you down until you notice.",
    manifestoAttrib: "The Curator's Note",
    artistEyebrow: "The Person Behind the Work",
    artistName: "Alafi Jonathan",
    artistPortrait: "AJ1.jpg",
    artistCopy: "An artist working across painting, sketching, digital art, and sculpture — driven by curiosity and a love of storytelling through colour and form.\n\nEvery collection here reflects a continuing exploration of craftsmanship and expression, made in public, one piece at a time.",
    finaleEyebrow: "Your Journey Starts Here",
    finaleTitle: "Step Into the Gallery",
    finaleBlurb: "Every collection is waiting. Explore freely, and see the work up close."
  },

  /* The story that sits under the Alafi block on the homepage, and the long
     form of the same voice on the About page. */
  story: {
    enabled: true,
    eyebrow: "In his own words",
    heading: "The Story So Far",
    body: "It started small — a pencil, a blank page, and a curiosity about what could be made from nothing. Over time, that curiosity turned into discipline, and discipline turned into a voice.\n\nEvery collection since has been another chapter in that same, ongoing story: learning to see the world a little more closely, and finding a way to hand that vision to someone else.",
    mediaUrl: "",
    mediaType: "",      /* "image" | "video" | "" */
    mediaPoster: "",
    ctaLabel: "Read the full story",
    ctaHref: "about.html"
  },

  /**
   * The About page is a list of typed blocks rather than a fixed set of
   * slots. The page shipped with five different shapes on it -- prose, a
   * numbered process, a tag cloud, a timeline, a row of figures -- and a
   * fixed schema would have meant the owner could edit the words in each but
   * never add a sixth, drop one, or move the timeline above the philosophy.
   * A typed list costs the renderer one switch and buys all of that.
   */
  about: {
    title: "About the Artist",
    tagline: "The person behind the work",
    blurb: "Hi, I’m Alafi Jonathan — an artist passionate about expressing stories through colour, pattern, and imagination. My work blends traditional and digital forms, exploring culture, creativity, and emotion.",
    portrait: "AJ1.jpg",
    quote: "Every artwork is a piece of a larger story I’m still telling.",
    blocks: [
      {
        type: "prose", eyebrow: "Where it began", heading: "The Story",
        body: "It started small — a pencil, a blank page, and a curiosity about what could be made from nothing. Over time, that curiosity turned into discipline, and discipline turned into a voice. Every collection since has been another chapter in that same, ongoing story: learning to see the world a little more closely, and finding a way to hand that vision to someone else."
      },
      {
        type: "prose", eyebrow: "Philosophy", heading: "Artistic Philosophy",
        body: "Art, at its best, doesn’t explain — it reveals. Every piece here is an attempt to hold a feeling still long enough for someone else to recognise it. Creating isn’t about perfection; it’s about honesty, and letting each work carry a little bit of truth that words alone couldn’t say."
      },
      {
        type: "steps", eyebrow: "Behind the work", heading: "Creative Process", body: "",
        items: [
          { title: "Inspiration", text: "An idea catches hold, often somewhere unexpected." },
          { title: "Sketching", text: "Rough lines find the shape of the idea before anything else does." },
          { title: "Creation", text: "Colour, texture, and detail slowly bring the piece to life." },
          { title: "Final artwork", text: "A finished piece, ready to become part of someone else’s story." }
        ]
      },
      {
        type: "tags", eyebrow: "Where it comes from", heading: "Sources of Inspiration",
        body: "Inspiration rarely announces itself — it’s found, then followed.",
        items: [
          { title: "Nature" }, { title: "Culture" }, { title: "People" }, { title: "Dreams" },
          { title: "Emotion" }, { title: "Daily life" }, { title: "Imagination" }
        ]
      },
      {
        type: "timeline", eyebrow: "The path so far", heading: "Artistic Journey", body: "",
        items: [
          { title: "Beginning", text: "The first sketches — simple, curious, unpolished." },
          { title: "Learning", text: "Studying technique, form, and the fundamentals of craft." },
          { title: "Growth", text: "Finding a distinct voice across painting, sketching, and digital work." },
          { title: "Exploration", text: "Branching into sculpture, comics, and graphic design." },
          { title: "Present day", text: "Continuing to create, share, and grow with every new piece." }
        ]
      },
      {
        type: "figures", eyebrow: "In numbers", heading: "Where Things Stand", body: "",
        items: [
          { title: "5+", text: "Years creating" },
          { title: "7", text: "Art categories" },
          { title: "100+", text: "Completed works" },
          { title: "3", text: "Current projects" }
        ]
      }
    ]
  },

  gallery: {
    title: "The Collections",
    tagline: "Seven rooms, one gallery",
    blurb: "Each collection has its own temperament. Take whichever door looks most interesting — there's no wrong order.",
    /* Cover image per category slug. Empty means "use the first piece in that
       collection", so a new collection needs no cover picked by hand. */
    covers: {
      paintings: "artworks/paintings/painting3.jpg",
      sketches: "artworks/sketches/sketch5.jpg",
      digital: "artworks/digital/digital8.jpg",
      sculptures: "artworks/sculptures/sculpture2.jpg",
      portraits: "artworks/portraits/portrait6.jpg",
      graphics: "artworks/graphics/graphic4.jpg",
      comics: "artworks/comics/comic1.jpg"
    }
  },

  /**
   * How images are delivered. Off by default: switching it on changes the URL
   * every existing Cloudinary image is served from, which is the owner's call
   * to make rather than a default to inherit.
   */
  delivery: {
    autoQuality: false
  },

  backgrounds: {
    home: "2.jpg",
    gallery: "1.jpg",
    category: "2.jpg",
    comics: "2.jpg",
    about: "AJ2.JPG",
    contact: "1.jpg"
  }
};

/* ------------------------------------------------------------------ */
/*  Derived palette                                                    */
/* ------------------------------------------------------------------ */

/**
 * Expands the eight chosen colours into the full token set core.css consumes.
 * The ratios here are the ones the palette was hand-tuned to; keeping them as
 * arithmetic means a new ground colour drags its hairlines, wells, and dimmed
 * inks along with it instead of leaving them stranded at the old values.
 */
export function derivePalette(theme) {
  const t = { ...DEFAULT_CONFIG.theme, ...(theme || {}) };
  const safe = (v, fallback) => (isHex(v) ? v : fallback);

  const bg = safe(t.bg, DEFAULT_CONFIG.theme.bg);
  const raised = safe(t.bgRaised, DEFAULT_CONFIG.theme.bgRaised);
  const fg = safe(t.fg, DEFAULT_CONFIG.theme.fg);
  const gold = safe(t.gold, DEFAULT_CONFIG.theme.gold);
  const goldFill = safe(t.goldFill, DEFAULT_CONFIG.theme.goldFill);

  const field = mix(raised, "#ffffff", 0.55);
  const display = (DISPLAY_FONTS[t.displayFont] || DISPLAY_FONTS.cormorant).stack;
  const body = (BODY_FONTS[t.bodyFont] || BODY_FONTS.inter).stack;

  return {
    "--bg": bg,
    "--bg-raised": raised,
    "--bg-sunken": mix(bg, fg, 0.04),
    "--bg-veil": alpha(bg, 0.86),

    /* Every scrim laid over a photograph is the page ground at some opacity.
       Written as literal rgba() they stayed at the shipped colour and left the
       artwork behind them veiled in the old palette, so they are derived. */
    "--veil-faint": alpha(bg, 0.34),
    "--veil-light": alpha(bg, 0.62),
    "--veil-mid": alpha(bg, 0.72),
    "--veil-strong": alpha(bg, 0.88),
    "--veil-heavy": alpha(bg, 0.92),
    "--veil-solid": alpha(bg, 0.97),
    "--nav-bg": alpha(mix(bg, "#ffffff", 0.35), 0.88),
    "--nav-panel": alpha(raised, 0.98),

    "--field": field,
    "--field-edge": alpha(fg, 0.3),
    "--control": raised,
    "--control-hover": field,

    "--fg": fg,
    "--fg-dim": mix(fg, bg, 0.26),
    "--fg-faint": mix(fg, bg, 0.38),

    "--hairline": alpha(fg, 0.2),
    "--hairline-strong": alpha(fg, 0.34),

    "--shadow-sm": `0 1px 2px ${alpha(fg, 0.06)}, 0 2px 8px ${alpha(fg, 0.05)}`,
    "--shadow-md": `0 2px 4px ${alpha(fg, 0.07)}, 0 10px 28px ${alpha(fg, 0.09)}`,
    "--shadow-lg": `0 26px 64px ${alpha(fg, 0.2)}`,

    "--gold": gold,
    "--gold-fill": goldFill,
    "--gold-soft": alpha(gold, 0.13),
    "--gold-edge": alpha(gold, 0.5),
    "--on-gold": readableOn(goldFill, mix(fg, goldFill, 0.1), lighten(raised, 0.4)),

    "--danger": safe(t.danger, DEFAULT_CONFIG.theme.danger),
    "--ok": safe(t.ok, DEFAULT_CONFIG.theme.ok),

    "--display": display,
    "--body": body,

    "--gutter": `clamp(20px, 5vw, ${Number(t.gutter) || 80}px)`,
    "--measure": `${Number(t.measure) || 1440}px`
  };
}

/** The palette as a stylesheet, ready to inject. */
export function themeCss(theme) {
  const vars = derivePalette(theme);
  const body = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join("\n");
  return `:root {\n${body}\n}`;
}

/**
 * The readability check that stands between the owner and an unreadable site.
 * Reported, not merely computed: the settings page shows every pair and
 * refuses to publish while anything is below the "fails" threshold.
 */
export function contrastReport(theme) {
  const p = derivePalette(theme);
  const pairs = [
    { label: "Body text on the page", fg: p["--fg"], bg: p["--bg"], min: 4.5 },
    { label: "Body text on cards", fg: p["--fg"], bg: p["--bg-raised"], min: 4.5 },
    { label: "Secondary text on the page", fg: p["--fg-dim"], bg: p["--bg"], min: 4.5 },
    { label: "Accent text on the page", fg: p["--gold"], bg: p["--bg"], min: 4.5 },
    { label: "Text on accent buttons", fg: p["--on-gold"], bg: p["--gold-fill"], min: 4.5 },
    { label: "Cards against the page", fg: p["--bg-raised"], bg: p["--bg"], min: 1.08 }
  ];

  return pairs.map((pair) => {
    const ratio = contrast(pair.fg, pair.bg);
    return {
      ...pair,
      ratio,
      level: ratio >= pair.min ? "pass" : ratio >= pair.min * 0.72 ? "warn" : "fail"
    };
  });
}

export function hasBlockingContrastFailure(theme) {
  return contrastReport(theme).some(r => r.level === "fail");
}

/* ------------------------------------------------------------------ */
/*  Merge                                                              */
/* ------------------------------------------------------------------ */

function isPlainObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Deep-merges a stored document over the defaults. A field the owner has never
 * touched keeps its shipped value, so adding a new setting in code never
 * blanks a live page — the new key simply is not in the stored document yet.
 */
export function mergeConfig(remote) {
  const walk = (base, patch) => {
    if (!isPlainObject(patch)) return base;
    const out = Array.isArray(base) ? base.slice() : { ...base };
    Object.keys(patch).forEach((key) => {
      const value = patch[key];
      if (value === undefined || value === null) return;
      out[key] = isPlainObject(value) && isPlainObject(base?.[key]) ? walk(base[key], value) : value;
    });
    return out;
  };
  return walk(DEFAULT_CONFIG, remote || {});
}

/* ------------------------------------------------------------------ */
/*  Embedded video                                                     */
/* ------------------------------------------------------------------ */

/**
 * Recognises a YouTube or Vimeo link and returns the player URL for it.
 *
 * This is the escape hatch for anything too long to host on Cloudinary. The
 * YouTube form is the no-cookie player, which is the difference between
 * embedding a video and embedding an advertising tracker on a gallery page.
 *
 * Returns null for anything unrecognised, which is what the settings page
 * checks before saving — so a mistyped link is caught there rather than
 * rendering an empty black rectangle on the homepage.
 */
export function parseEmbed(url) {
  const raw = (url || "").trim();
  if (!raw) return null;

  const youtube = raw.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/i
  );
  if (youtube) {
    return {
      provider: "YouTube",
      id: youtube[1],
      src: `https://www.youtube-nocookie.com/embed/${youtube[1]}?rel=0`
    };
  }

  const vimeo = raw.match(/vimeo\.com\/(?:video\/)?(\d{6,})/i);
  if (vimeo) {
    return {
      provider: "Vimeo",
      id: vimeo[1],
      src: `https://player.vimeo.com/video/${vimeo[1]}?dnt=1`
    };
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  Preview mode                                                       */
/* ------------------------------------------------------------------ */

/**
 * A page is in preview when the URL says so. The draft document is admin-only
 * by security rule, so a visitor who guesses the parameter gets a permission
 * error and silently falls back to the published site — the flag grants no
 * access on its own.
 */
export function isPreview() {
  try {
    return new URLSearchParams(location.search).get("preview") === "1";
  } catch {
    return false;
  }
}

export function previewSuffix() {
  return isPreview() ? "?preview=1" : "";
}

/** Rewrites a same-site link so preview navigation stays inside preview. */
export function previewHref(href) {
  if (!isPreview() || !href || /^(https?:|mailto:|tel:|#)/i.test(href)) return href;
  return href.includes("?") ? `${href}&preview=1` : `${href}?preview=1`;
}

/* ------------------------------------------------------------------ */
/*  Read / write                                                       */
/* ------------------------------------------------------------------ */

function configRef(which) {
  return doc(db, "siteConfig", which === "draft" ? "draft" : "published");
}

export function cachedConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_CACHE_KEY);
    return raw ? mergeConfig(JSON.parse(raw)) : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

function cacheConfig(config) {
  try {
    localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(config));
    localStorage.setItem(THEME_CACHE_KEY, themeCss(config.theme));
  } catch { /* private mode — the page still works, it just repaints once */ }
}

/**
 * The config as it stands right now, readable synchronously.
 *
 * The data layer decides how to build an image URL while it is normalising a
 * snapshot, which is not a place that can await anything. It starts from the
 * cached copy and is replaced whenever a live snapshot lands, so the first
 * paint of a first-ever visit uses the shipped defaults and everything after
 * uses the real thing.
 */
let activeConfig = null;

export function currentConfig() {
  if (!activeConfig) activeConfig = cachedConfig();
  return activeConfig;
}

export function autoQualityEnabled() {
  return currentConfig().delivery?.autoQuality === true;
}

export async function fetchConfig(which = "published") {
  try {
    const snap = await getDoc(configRef(which));
    return mergeConfig(snap.exists() ? snap.data() : null);
  } catch (err) {
    console.warn(`fetchConfig(${which}) failed, using defaults.`, err);
    return DEFAULT_CONFIG;
  }
}

/**
 * Live config for a public page. In preview it listens to the draft, and falls
 * back to published the moment the draft read is refused — which is exactly
 * what happens to anyone who is not signed in as the owner.
 */
export function watchConfig(callback, { which = null } = {}) {
  const target = which || (isPreview() ? "draft" : "published");

  const stop = onSnapshot(configRef(target), (snap) => {
    const config = mergeConfig(snap.exists() ? snap.data() : null);
    if (target === "published") cacheConfig(config);
    callback(config, { source: target });
  }, (err) => {
    console.warn(`watchConfig(${target}) failed.`, err);
    if (target === "draft") {
      onSnapshot(configRef("published"), (snap) => {
        const config = mergeConfig(snap.exists() ? snap.data() : null);
        cacheConfig(config);
        callback(config, { source: "published", deniedDraft: true });
      });
    } else {
      callback(cachedConfig(), { source: "cache" });
    }
  });

  return stop;
}

export async function saveDraft(config) {
  await setDoc(configRef("draft"), { ...config, updatedAt: serverTimestamp() }, { merge: true });
}

/** Copies the draft over published in one write, then records it. */
export async function publishDraft() {
  const draft = await getDoc(configRef("draft"));
  const payload = draft.exists() ? draft.data() : DEFAULT_CONFIG;
  await setDoc(configRef("published"), { ...payload, publishedAt: serverTimestamp() });
  return mergeConfig(payload);
}

/** Throws the draft away by resetting it to whatever is currently live. */
export async function discardDraft() {
  const live = await getDoc(configRef("published"));
  const payload = live.exists() ? live.data() : DEFAULT_CONFIG;
  await setDoc(configRef("draft"), { ...payload, updatedAt: serverTimestamp() });
  return mergeConfig(payload);
}

/* ------------------------------------------------------------------ */
/*  Applying a config to the page                                      */
/* ------------------------------------------------------------------ */

function readPath(config, path) {
  return path.split(".").reduce((node, key) => (node == null ? undefined : node[key]), config);
}

let styleTag = null;
let fontLink = null;

export function applyTheme(theme) {
  if (!styleTag) {
    styleTag = document.getElementById("theme-vars") || document.createElement("style");
    styleTag.id = "theme-vars";
    document.head.appendChild(styleTag);
  }
  styleTag.textContent = themeCss(theme);

  const href = googleFontHref(theme?.displayFont, theme?.bodyFont);
  if (!fontLink) {
    fontLink = document.createElement("link");
    fontLink.rel = "stylesheet";
    fontLink.id = "theme-fonts";
    document.head.appendChild(fontLink);
  }
  if (fontLink.getAttribute("href") !== href) fontLink.href = href;
}

/**
 * Binds the declarative hooks in the HTML. A page marks an element with
 * `data-cfg-text="branding.wordmark"` and it is filled from the config; there
 * is no per-page wiring to keep in step with the markup.
 *
 * `data-cfg-html` is for the handful of strings that carry an <em> or a <b>.
 * They are owner-authored and admin-only to write, so this is not a user-input
 * injection surface — but the settings editor still strips scripts on save.
 */
export function applyBindings(config, root = document) {
  root.querySelectorAll("[data-cfg-text]").forEach((el) => {
    const value = readPath(config, el.dataset.cfgText);
    if (typeof value === "string") el.textContent = value;
  });

  root.querySelectorAll("[data-cfg-html]").forEach((el) => {
    const value = readPath(config, el.dataset.cfgHtml);
    if (typeof value === "string") el.innerHTML = value;
  });

  root.querySelectorAll("[data-cfg-prose]").forEach((el) => {
    const value = readPath(config, el.dataset.cfgProse);
    if (typeof value === "string") el.innerHTML = paragraphs(value);
  });

  root.querySelectorAll("[data-cfg-src]").forEach((el) => {
    const value = readPath(config, el.dataset.cfgSrc);
    if (typeof value === "string" && value && el.getAttribute("src") !== value) el.src = value;
  });

  root.querySelectorAll("[data-cfg-bg]").forEach((el) => {
    const value = readPath(config, el.dataset.cfgBg);
    if (typeof value === "string" && value) el.style.setProperty("--page-bg", `url("${value}")`);
  });

  root.querySelectorAll("[data-cfg-title]").forEach((el) => {
    const value = readPath(config, el.dataset.cfgTitle);
    if (typeof value === "string" && value) document.title = value;
  });
}

/** Newline-separated owner copy into paragraphs, with the text escaped. */
export function paragraphs(text) {
  return (text || "")
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => `<p>${escapeHtml(part).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

/** Keeps preview navigation inside preview, so the owner can click around. */
export function rewriteLinksForPreview(root = document) {
  if (!isPreview()) return;
  root.querySelectorAll('a[href$=".html"], a[href^="category.html"]').forEach((a) => {
    a.href = previewHref(a.getAttribute("href"));
  });
}

/**
 * The one call a public page makes. Paints immediately from the cached config
 * so there is no flash, then repaints when the live document arrives.
 */
export function initSiteConfig(onConfig) {
  const paint = (config, meta) => {
    activeConfig = config;
    applyTheme(config.theme);
    applyBindings(config);
    rewriteLinksForPreview();
    onConfig?.(config, meta);
  };

  paint(cachedConfig(), { source: "cache" });
  return watchConfig(paint);
}
