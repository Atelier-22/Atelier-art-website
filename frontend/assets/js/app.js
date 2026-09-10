import { initContent, repaintContent } from "./site-content.js?v=20260823a";
import { initRouter } from "./router.js?v=20260823a";

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
