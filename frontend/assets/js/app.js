import { initContent, repaintContent } from "./site-content.js?v=20261031a";
import { configReady } from "./site-config.js?v=20261031a";
import { initRouter } from "./router.js?v=20261031a";
import { startFooterCollections } from "./footer-collections.js?v=20261031a";

function pageKind(doc = document) {
  const body = doc.body;
  if (body.dataset.page === "home") return "home";
  if (body.dataset.page === "gallery") return "gallery";
  if (body.dataset.page === "comics") return "comics";
  if (body.dataset.page === "category") return "category";
  return "prose";
}

const MODULES = {
  home: () => import("./home.js?v=20261031a"),
  gallery: () => import("./gallery-index.js?v=20261031a"),
  comics: () => import("./comics.js?v=20261031a"),
  category: () => import("./gallery-page.js?v=20261031a"),
  prose: () => import("./page.js?v=20261031a")
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

function remount() {
  try { mounted?.unmount?.(); }
  catch (err) { console.error("unmount failed:", err); }
  try { mounted?.mount?.(); }
  catch (err) { console.error("remount failed:", err); }
}

initContent((config, meta) => {
  if (meta?.qualityChanged) { remount(); return; }
  try { mounted?.onConfig?.(config, meta); }
  catch (err) { console.error("page onConfig failed:", err); }
});

startFooterCollections();

(async () => {
  await configReady;
  mounted = await resolvePage(document);
  try { mounted?.mount?.(); }
  catch (err) { console.error("Initial mount failed:", err); }
  document.dispatchEvent(new CustomEvent("alafi:mounted"));

  initRouter({
    initial: mounted,
    repaint: () => repaintContent(),
    resolvePage: async (doc) => {
      mounted = await resolvePage(doc);
      return mounted;
    }
  });
})();
