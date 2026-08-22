/**
 * Colour maths for the theme editor.
 *
 * The settings page exposes eight colours. Everything else in the palette --
 * some twenty-five tokens -- is derived from those eight here, so the owner
 * cannot produce a half-themed site by editing one value and forgetting the
 * four that used to sit next to it. The derivations are the same relationships
 * core.css was hand-tuned to, expressed as arithmetic.
 */

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function isHex(value) {
  return typeof value === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
}

export function parseHex(value, fallback = "#000000") {
  let hex = (isHex(value) ? value : fallback).trim().slice(1);
  if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
  const n = parseInt(hex, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function toHex({ r, g, b }) {
  const part = n => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** t = 0 returns `a` untouched; t = 1 returns `b`. */
export function mix(a, b, t) {
  const x = parseHex(a);
  const y = parseHex(b);
  return toHex({
    r: x.r + (y.r - x.r) * t,
    g: x.g + (y.g - x.g) * t,
    b: x.b + (y.b - x.b) * t
  });
}

export function alpha(hex, a) {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function lighten(hex, amount) { return mix(hex, "#ffffff", amount); }
export function darken(hex, amount) { return mix(hex, "#000000", amount); }

/** WCAG relative luminance. */
export function luminance(hex) {
  const { r, g, b } = parseHex(hex);
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Whichever of the two candidates reads better on `background`. */
export function readableOn(background, dark = "#14120e", light = "#f6f3ec") {
  return contrast(background, dark) >= contrast(background, light) ? dark : light;
}

export function isDark(hex) {
  return luminance(hex) < 0.4;
}
