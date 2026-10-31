import { db } from "../../firebase-config.js?v=20261031a";
import {
  doc, setDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { mix, alpha, lighten, contrast, readableOn, isHex } from "./color.js?v=20261031a";

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


export const THEME_DEFAULTS = {
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
};

const media = () => ({ mediaUrl: "", mediaType: "", mediaPoster: "", mediaDuration: null });

export const CONFIG_SHAPE = {
  theme: THEME_DEFAULTS,
  branding: {
    wordmark: "", wordmarkDot: "", logoUrl: "", siteTitle: "",
    footerBlurb: "", copyright: "", rights: ""
  },
  home: {
    heroEyebrow: "", heroLine1: "", heroLine2: "", heroLine3: "",
    heroStory: [], heroCtaLabel: "", heroBlurb: "", heroStats: [], heroImages: [],
    manifesto: "", manifestoAttrib: "",
    artistEyebrow: "", artistName: "", artistPortrait: "", artistCopy: "", artistCtaLabel: "",
    finaleEyebrow: "", finaleTitle: "", finaleBlurb: "", finaleCtaLabel: ""
  },
  update: {
    enabled: false, text: "", linkLabel: "", linkHref: "", ...media(),
    postedAt: null, durationHours: 24
  },
  story: {
    enabled: false, position: "artist", eyebrow: "", heading: "", body: "", ...media(),
    ctaLabel: "", ctaHref: ""
  },
  about: { title: "", tagline: "", blurb: "", portrait: "", quote: "", blocks: [] },
  gallery: { title: "", tagline: "", blurb: "" },
  comics: { title: "", tagline: "", blurb: "" },
  contact: {
    title: "", tagline: "", blurb: "", eyebrow: "", heading: "", items: [],
    topicsEyebrow: "", topicsHeading: "", topics: [], blocks: []
  },
  legal: { privacyTitle: "", privacyHtml: "", termsTitle: "", termsHtml: "" },
  notFound: { title: "", tagline: "", blurb: "" },
  seo: { description: "", shareImage: "" },
  delivery: { autoQuality: false },
  sound: { enabled: false, tracks: [], shuffle: true, crossfade: 6, volume: 30, autoplay: false },
  backgrounds: { home: "", gallery: "", category: "", comics: "", about: "", contact: "", notFound: "" }
};


function isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function conform(shape, remote) {
  const out = {};
  Object.keys(shape).forEach((key) => {
    const base = shape[key];
    const value = isPlainObject(remote) ? remote[key] : undefined;
    if (isPlainObject(base)) { out[key] = conform(base, value); return; }
    if (Array.isArray(base)) { out[key] = Array.isArray(value) ? value : []; return; }
    if (base === null) { out[key] = value === undefined ? null : value; return; }
    out[key] = typeof value === typeof base ? value : base;
  });
  return out;
}

export function mergeConfig(remote) {
  return conform(CONFIG_SHAPE, remote || {});
}


export function derivePalette(theme) {
  const t = { ...THEME_DEFAULTS, ...(theme || {}) };
  const safe = (v, fallback) => (isHex(v) ? v : fallback);

  const bg = safe(t.bg, THEME_DEFAULTS.bg);
  const raised = safe(t.bgRaised, THEME_DEFAULTS.bgRaised);
  const fg = safe(t.fg, THEME_DEFAULTS.fg);
  const gold = safe(t.gold, THEME_DEFAULTS.gold);
  const goldFill = safe(t.goldFill, THEME_DEFAULTS.goldFill);

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

    "--danger": safe(t.danger, THEME_DEFAULTS.danger),
    "--ok": safe(t.ok, THEME_DEFAULTS.ok),

    "--display": display,
    "--body": body,

    "--gutter": `clamp(20px, 5vw, ${Number(t.gutter) || THEME_DEFAULTS.gutter}px)`,
    "--measure": `${Number(t.measure) || THEME_DEFAULTS.measure}px`
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


const configRef = () => doc(db, "siteConfig", "published");

let activeConfig = null;
let readyResolve = null;
export const configReady = new Promise((resolve) => { readyResolve = resolve; });

export function currentConfig() {
  return activeConfig || mergeConfig(null);
}

export function autoQualityEnabled() {
  return activeConfig?.delivery?.autoQuality === true;
}

function cacheTheme(theme) {
  try { localStorage.setItem(THEME_CACHE_KEY, themeCss(theme)); }
  catch (err) { console.error("Could not store the theme for the next first paint.", err); }
}

export function watchConfig(callback, onError) {
  return onSnapshot(configRef(), (snap) => {
    const config = mergeConfig(snap.exists() ? snap.data() : null);
    callback(config);
  }, (err) => {
    console.error("watchConfig error:", err);
    onError?.(err);
  });
}

export async function saveConfig(config) {
  await setDoc(configRef(), { ...mergeConfig(config), updatedAt: serverTimestamp() });
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
    fontLink = document.getElementById("theme-fonts") || document.createElement("link");
    fontLink.rel = "stylesheet";
    fontLink.id = "theme-fonts";
    document.head.appendChild(fontLink);
  }
  if (fontLink.getAttribute("href") !== href) fontLink.href = href;
}

const asText = (value) => (typeof value === "string" ? value : "");

export function applyBindings(config, root = document) {
  root.querySelectorAll("[data-cfg-text]").forEach((el) => {
    const value = asText(readPath(config, el.dataset.cfgText));
    el.textContent = value;
    el.hidden = !value.trim();
  });

  root.querySelectorAll("[data-cfg-html]").forEach((el) => {
    const value = asText(readPath(config, el.dataset.cfgHtml));
    if (el.dataset.cfgSource !== value) {
      el.innerHTML = value;
      el.dataset.cfgSource = value;
    }
    el.hidden = !value.trim();
  });

  root.querySelectorAll("[data-cfg-prose]").forEach((el) => {
    const value = asText(readPath(config, el.dataset.cfgProse));
    el.innerHTML = paragraphs(value);
    el.hidden = !value.trim();
  });

  root.querySelectorAll("[data-cfg-legal]").forEach((el) => {
    const value = asText(readPath(config, el.dataset.cfgLegal));
    if (el.dataset.cfgSource !== value) {
      el.innerHTML = sanitiseHtml(value);
      el.dataset.cfgSource = value;
    }
  });

  root.querySelectorAll("[data-cfg-src]").forEach((el) => {
    const value = asText(readPath(config, el.dataset.cfgSrc)).trim();
    const holder = el.closest("[data-cfg-holder]");
    if (value) {
      if (el.getAttribute("src") !== value) el.src = value;
      el.hidden = false;
    } else {
      el.removeAttribute("src");
      el.hidden = true;
    }
    if (holder) holder.hidden = !value;
  });

  root.querySelectorAll("[data-cfg-bg]").forEach((el) => {
    const value = asText(readPath(config, el.dataset.cfgBg)).trim();
    if (value) el.style.setProperty("--page-bg", `url("${value.replace(/"/g, "%22")}")`);
    else el.style.removeProperty("--page-bg");
  });
}

export function sanitiseHtml(value) {
  return String(value || "")
    .replace(/<\s*(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*\/?\s*(script|style|iframe|object|embed|link|meta)\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
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

export function initSiteConfig(onConfig) {
  return watchConfig((config) => {
    const qualityChanged = activeConfig && activeConfig.delivery.autoQuality !== config.delivery.autoQuality;
    activeConfig = config;
    applyTheme(config.theme);
    cacheTheme(config.theme);
    applyBindings(config);
    readyResolve?.(config);
    readyResolve = null;
    onConfig?.(config, { qualityChanged });
  }, (err) => {
    console.error("The live site settings could not be read.", err);
  });
}
