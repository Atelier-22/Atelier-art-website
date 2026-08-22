const seed = (dir, prefix, count) =>
  Array.from({ length: count }, (_, i) => `artworks/${dir}/${prefix}${i + 1}.jpg`);

export const ART_CATEGORIES = [
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
    seeds: seed("comics", "comic", 3)
  }
];

export const CATEGORY_BY_SLUG = Object.fromEntries(
  ART_CATEGORIES.map(c => [c.slug, c])
);

export const CATEGORY_LABELS = Object.fromEntries(
  ART_CATEGORIES.map(c => [c.slug, c.label])
);

export const CATEGORY_SLUGS = ART_CATEGORIES.map(c => c.slug);

export const DEFAULT_COMIC_GENRES = [
  { slug: "action", label: "Action", order: 0 },
  { slug: "fantasy", label: "Fantasy", order: 1 },
  { slug: "drama", label: "Drama", order: 2 },
  { slug: "sci-fi", label: "Sci-Fi", order: 3 }
];

export function currentCategorySlug() {
  const explicit = document.body?.dataset?.category;
  if (explicit && CATEGORY_BY_SLUG[explicit]) return explicit;
  const file = location.pathname.split("/").pop().replace(/\.html$/, "");
  return CATEGORY_BY_SLUG[file] ? file : "general";
}
