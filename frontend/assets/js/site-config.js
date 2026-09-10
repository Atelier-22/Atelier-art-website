import { db } from "../../firebase-config.js?v=20260823a";
import {
  doc, getDoc, setDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { mix, alpha, lighten, contrast, readableOn, isHex } from "./color.js?v=20260823a";

export const CONFIG_CACHE_KEY = "alafi_site_config";
export const THEME_CACHE_KEY = "alafi_theme_css";


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
    gutter: 80,
    measure: 1440
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

  update: {
    enabled: false,
    text: "",
    linkLabel: "",
    linkHref: "",
    mediaUrl: "",
    mediaType: "",
    mediaPoster: "",
    mediaDuration: null,
    postedAt: null,
    durationHours: 24
  },

  story: {
    enabled: true,
    position: "artist",
    eyebrow: "In his own words",
    heading: "The Story So Far",
    body: "It started small — a pencil, a blank page, and a curiosity about what could be made from nothing. Over time, that curiosity turned into discipline, and discipline turned into a voice.\n\nEvery collection since has been another chapter in that same, ongoing story: learning to see the world a little more closely, and finding a way to hand that vision to someone else.",
    mediaUrl: "",
    mediaType: "",
    mediaPoster: "",
    mediaDuration: null,
    ctaLabel: "Read the full story",
    ctaHref: "about.html"
  },

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

  delivery: {
    autoQuality: false
  },

  sound: {
    enabled: false,
    tracks: [],
    shuffle: true,
    crossfade: 6,
    volume: 30,
    autoplay: false
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

export function themeCss(theme) {
  const vars = derivePalette(theme);
  const body = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join("\n");
  return `:root {\n${body}\n}`;
}

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


function isPlainObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

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
  return upgrade(walk(DEFAULT_CONFIG, remote || {}));
}

function upgrade(config) {
  const sound = config.sound || {};
  if (!Array.isArray(sound.tracks) || (!sound.tracks.length && sound.trackUrl)) {
    const tracks = sound.trackUrl
      ? [{ url: sound.trackUrl, title: sound.title || "" }]
      : (Array.isArray(sound.tracks) ? sound.tracks : []);
    const { trackUrl, title, ...rest } = sound;
    return { ...config, sound: { ...DEFAULT_CONFIG.sound, ...rest, tracks } };
  }
  return config;
}


export const UPDATE_DURATIONS = [
  { hours: 6, label: "6 hours" },
  { hours: 12, label: "12 hours" },
  { hours: 24, label: "24 hours" },
  { hours: 48, label: "2 days" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "1 week" },
  { hours: 336, label: "2 weeks" },
  { hours: 0, label: "Until I take it down" }
];

export function updateState(update) {
  const posted = update?.postedAt ? Date.parse(update.postedAt) : NaN;
  const hours = Number(update?.durationHours);
  const hasText = !!(update?.text || "").trim();

  if (update?.enabled !== true || !hasText) {
    return { live: false, reason: hasText ? "off" : "empty", postedAt: posted || null };
  }
  if (!Number.isFinite(posted)) {
    return { live: false, reason: "unposted", postedAt: null };
  }
  if (!hours) {
    return { live: true, reason: "indefinite", postedAt: posted, expiresAt: null, remainingMs: Infinity };
  }

  const expiresAt = posted + hours * 3600 * 1000;
  const remainingMs = expiresAt - Date.now();
  return {
    live: remainingMs > 0,
    reason: remainingMs > 0 ? "live" : "expired",
    postedAt: posted,
    expiresAt,
    remainingMs
  };
}

export function timeAgo(ms) {
  const diff = Math.max(0, Date.now() - ms) / 1000;
  if (diff < 90) return "just now";
  const units = [[86400, "day"], [3600, "hour"], [60, "minute"]];
  for (const [size, name] of units) {
    if (diff >= size) {
      const n = Math.floor(diff / size);
      return `${n} ${name}${n === 1 ? "" : "s"} ago`;
    }
  }
  return "just now";
}

export function timeLeft(ms) {
  if (!Number.isFinite(ms)) return "no time limit";
  if (ms <= 0) return "expired";
  const diff = ms / 1000;
  const units = [[86400, "day"], [3600, "hour"], [60, "minute"]];
  for (const [size, name] of units) {
    if (diff >= size) {
      const n = Math.floor(diff / size);
      return `${n} ${name}${n === 1 ? "" : "s"} left`;
    }
  }
  return "less than a minute left";
}


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

export function previewHref(href) {
  if (!isPreview() || !href || /^(https?:|mailto:|tel:|#)/i.test(href)) return href;
  return href.includes("?") ? `${href}&preview=1` : `${href}?preview=1`;
}


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
  } catch { }
}

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

export async function publishDraft() {
  const draft = await getDoc(configRef("draft"));
  const payload = draft.exists() ? draft.data() : DEFAULT_CONFIG;
  await setDoc(configRef("published"), { ...payload, publishedAt: serverTimestamp() });
  return mergeConfig(payload);
}

export async function discardDraft() {
  const live = await getDoc(configRef("published"));
  const payload = live.exists() ? live.data() : DEFAULT_CONFIG;
  await setDoc(configRef("draft"), { ...payload, updatedAt: serverTimestamp() });
  return mergeConfig(payload);
}


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

export function rewriteLinksForPreview(root = document) {
  if (!isPreview()) return;
  root.querySelectorAll('a[href$=".html"], a[href^="category.html"]').forEach((a) => {
    a.href = previewHref(a.getAttribute("href"));
  });
}

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
