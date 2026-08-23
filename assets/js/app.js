/**
 * The one entry point every public page loads.
 *
 * Pages used to each load their own script, which meant the browser had to
 * throw the whole document away to get to the next one — and with it whatever
 * was playing. This mounts the right module for whichever page is showing and
 * lets the router swap between them without a reload.
 *
 * The site config is subscribed to here, once, rather than by each page: the
 * theme, the branding and the music belong to the visit, not to the page, and
 * re-subscribing on every navigation would be a listener leak with a flash of
 * unstyled content attached.
 */

import { initContent, repaintContent } from "./site-content.js?v=20260823a";
import { initRouter } from "./router.js?v=20260823a";

/**
 * Which module runs a given document. Read from the body's own attributes, so
 * it works the same for the page we loaded with and for one fetched later.
 */
function pageKind(doc = document) {
  const body = doc.body;
  if (body.dataset.page === "home") return "home";
  if (body.dataset.page === "gallery") return "gallery";
  if (body.dataset.page === "comics") return "comics";
  if (body.dataset.category || doc.getElementById("gallery-grid")) return "category";
  return "prose";
}

const MODULES = {
  home: () => import("./home.js?v=20260823a"),
  gallery: () => import("./gallery-index.js?v=20260823a"),
  comics: () => import("./comics.js?v=20260823a"),
  category: () => import("./gallery-page.js?v=20260823a"),
  prose: () => import("./page.js?v=20260823a")
};

async function resolvePage(doc) {
  const kind = pageKind(doc);
  const load = MODULES[kind] || MODULES.prose;
  try {
    return await load();
  } catch (err) {
    console.error(`Could not load the ${kind} module:`, err);
    return null;
  }
}

/* The mounted page gets first refusal on config changes — the homepage
   rebuilds its hero from them, for instance — and the shared content is
   repainted regardless. */
let mounted = null;

initContent((config, meta) => {
  try { mounted?.onConfig?.(config, meta); }
  catch (err) { console.warn("page onConfig failed:", err); }
});

(async () => {
  mounted = await resolvePage(document);
  try { mounted?.mount?.(); }
  catch (err) { console.error("Initial mount failed:", err); }

  initRouter({
    initial: mounted,
    repaint: () => repaintContent(),
    resolvePage: async (doc) => {
      mounted = await resolvePage(doc);
      return mounted;
    }
  });
})();
