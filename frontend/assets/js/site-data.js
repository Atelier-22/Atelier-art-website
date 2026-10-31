export function categoryHref(category) {
  return `category.html?c=${encodeURIComponent(category.slug)}`;
}

export function currentCategorySlug() {
  return new URLSearchParams(location.search).get("c") || "";
}
