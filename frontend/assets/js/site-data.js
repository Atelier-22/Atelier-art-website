const seed = (dir, prefix, count) =>
  Array.from({ length: count }, (_, i) => `artworks/${dir}/${prefix}${i + 1}.jpg`);

export const DEFAULT_ART_CATEGORIES = [
  {
    slug: "paintings",
    label: "Paintings",
    page: "paintings.html",
    tagline: "Color, mood, and light",
    blurb: "Layered pigment and texture built into scenes that hold a mood long after you look away.",
    seeds: seed("paintings", "painting", 20)
  },
  {
    slug: "sketches",
    label: "Sketches",
    page: "sketches.html",
    tagline: "The honest first pass",
    blurb: "Raw first impressions — the unfiltered moment before a piece decides what it wants to be.",
    seeds: seed("sketches", "sketch", 20)
  },
  {
    slug: "digital",
    label: "Digital Art",
    page: "digital.html",
    tagline: "Craft meets modern tools",
    blurb: "Traditional technique reimagined through modern tools, rendered light, and infinite undo.",
    seeds: seed("digital", "digital", 20)
  },
  {
    slug: "sculptures",
    label: "Sculptures",
    page: "sculptures.html",
    tagline: "Presence in three dimensions",
    blurb: "Where the work steps off the page — shape, weight, and presence you can walk around.",
    seeds: seed("sculptures", "sculpture", 20)
  },
  {
    slug: "portraits",
    label: "Portraits",
    page: "portraits.html",
    tagline: "Faces, caught mid-thought",
    blurb: "Studies in expression — each one an attempt to hold a person at the moment they forget the room.",
    seeds: seed("portraits", "portrait", 20)
  },
  {
    slug: "graphics",
    label: "Graphics",
    page: "graphics.html",
    tagline: "Structure and signal",
    blurb: "Type, form, and composition working together — design as a discipline of deliberate choices.",
    seeds: seed("graphics", "graphic", 20)
  },
  {
    slug: "comics",
    label: "Comics",
    page: "comics.html",
    tagline: "Stories, panel by panel",
    blurb: "Sequential worlds you read rather than glance at — enter a story and follow it to the last page.",
    seeds: seed("comics", "comic", 3),
    isComics: true
  }
];

export const DEFAULT_COMIC_CATEGORIES = [
  { slug: "action", label: "Action", tagline: "Momentum and consequence", blurb: "Stories that move — chases, stand-offs, and the split second before everything changes." },
  { slug: "fantasy", label: "Fantasy", tagline: "Worlds with their own rules", blurb: "Invented places where magic is a system, not a shortcut, and every map hides a cost." },
  { slug: "drama", label: "Drama", tagline: "The quiet, human weight", blurb: "No explosions needed — stories built from what people can not quite bring themselves to say." },
  { slug: "sci-fi", label: "Sci-Fi", tagline: "Tomorrow, extrapolated", blurb: "Speculative futures used as a lens on the present, drawn in cool light and hard edges." }
];

export const CATEGORY_BY_SLUG = Object.fromEntries(
  DEFAULT_ART_CATEGORIES.map(c => [c.slug, c])
);

export const LOCAL_SEEDS = Object.fromEntries(
  DEFAULT_ART_CATEGORIES.map(c => [c.slug, c.seeds])
);

export function categoryHref(category) {
  if (category.isComics || category.slug === "comics") return "comics.html";
  const known = CATEGORY_BY_SLUG[category.slug];
  return known ? known.page : `category.html?c=${encodeURIComponent(category.slug)}`;
}

export function currentCategorySlug() {
  const explicit = document.body?.dataset?.category;
  if (explicit) return explicit;
  const param = new URLSearchParams(location.search).get("c");
  if (param) return param;
  const file = location.pathname.split("/").pop().replace(/\.html$/, "");
  return CATEGORY_BY_SLUG[file] ? file : "general";
}

export function mergeCategories(remote) {
  const bySlug = new Map(DEFAULT_ART_CATEGORIES.map(c => [c.slug, { ...c }]));
  remote.forEach((cat, i) => {
    const base = bySlug.get(cat.slug) || { slug: cat.slug, seeds: [] };
    bySlug.set(cat.slug, {
      ...base,
      label: cat.name || base.label,
      tagline: cat.tagline || base.tagline || "",
      blurb: cat.blurb || base.blurb || "",
      order: cat.order ?? i,
      page: base.page || `category.html?c=${encodeURIComponent(cat.slug)}`
    });
  });
  return Array.from(bySlug.values())
    .filter(c => remote.length === 0 || remote.some(r => r.slug === c.slug))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
