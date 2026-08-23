/**
 * Client-side navigation, so the document is never torn down.
 *
 * This exists for one reason: audio cannot survive a page unload. An <audio>
 * element belongs to its document, and a normal link click destroys that
 * document and everything playing in it. No amount of remembering the position
 * fixes it — the sound stops, the next page loads, and it starts again.
 *
 * So the document stays. A link click fetches the next page, swaps the parts
 * of the body that belong to the page, and leaves everything else alone. The
 * music never knows anything happened, and neither does the theme, so pages
 * also stop flashing while they load.
 *
 * It is an enhancement, never a requirement. Anything unexpected — a fetch
 * that fails, a page that will not parse, a module that throws — falls through
 * to `location.href` and the browser does what it always did. The worst case
 * is the behaviour of the site before this file existed.
 */

const PERSIST = "[data-persist]";

let current = null;      // the mounted page module
let resolve = null;      // (document) -> Promise<module>
let repaint = null;      // re-applies the site config to fresh DOM
let navigating = false;

/* ------------------------------------------------------------------ */
/*  What we will and will not handle                                   */
/* ------------------------------------------------------------------ */

function isInternal(link, event) {
  if (event.defaultPrevented) return false;
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (!link || link.target === "_blank" || link.hasAttribute("download")) return false;
  if (link.dataset.noRouter !== undefined) return false;

  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin) return false;
  if (!/\.html$/.test(url.pathname) && url.pathname !== "/") return false;

  // A jump within the page we are already on is the browser's job.
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return false;

  // The admin panel is a different application; let it load properly.
  if (/admin\.html$/.test(url.pathname)) return false;

  return url;
}

/* ------------------------------------------------------------------ */
/*  Swapping                                                           */
/* ------------------------------------------------------------------ */

/**
 * Makes sure every stylesheet the incoming page asks for is present. Page
 * stylesheets are scoped by class, so accumulating them is harmless and means
 * a second visit to a section needs no new CSS at all.
 */
function adoptStyles(incoming) {
  const have = new Set(
    [...document.head.querySelectorAll('link[rel="stylesheet"]')]
      .map(l => l.getAttribute("href"))
  );

  const pending = [];
  incoming.head.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
    const href = link.getAttribute("href");
    if (have.has(href)) return;
    const copy = document.createElement("link");
    copy.rel = "stylesheet";
    copy.href = href;
    document.head.appendChild(copy);
    pending.push(new Promise((done) => {
      copy.addEventListener("load", done, { once: true });
      copy.addEventListener("error", done, { once: true });
      setTimeout(done, 2000);
    }));
  });

  return Promise.all(pending);
}

function swapBody(incoming) {
  // Anything marked persistent belongs to the visit, not the page: the music
  // control, the image viewer, the preview banner. They are lifted out, the
  // page is replaced underneath them, and they go back afterwards.
  const kept = [...document.body.querySelectorAll(PERSIST)];
  kept.forEach(node => node.remove());

  document.body.innerHTML = "";

  // Attributes carry the page's identity: which wallpaper, which category,
  // which nav item is current.
  [...document.body.attributes].forEach(attr => document.body.removeAttribute(attr.name));
  [...incoming.body.attributes].forEach(attr => document.body.setAttribute(attr.name, attr.value));

  [...incoming.body.children].forEach((node) => {
    // Scripts are not re-run: the modules are already loaded, and the router
    // mounts the right one itself.
    if (node.tagName === "SCRIPT") return;
    document.body.appendChild(document.importNode(node, true));
  });

  kept.forEach(node => document.body.appendChild(node));
}

async function render(url, { push = true, scroll = true } = {}) {
  const response = await fetch(url.href, { headers: { "X-Requested-With": "router" } });
  if (!response.ok) throw new Error(`${response.status} for ${url.pathname}`);

  const incoming = new DOMParser().parseFromString(await response.text(), "text/html");
  if (!incoming.body) throw new Error("unparseable document");

  await adoptStyles(incoming);

  // The old page lets go of its listeners and snapshots before its DOM goes.
  try { current?.unmount?.(); } catch (err) { console.warn("unmount failed:", err); }
  current = null;

  document.documentElement.setAttribute("data-bg", incoming.documentElement.getAttribute("data-bg") || "");
  document.title = incoming.title;

  swapBody(incoming);

  if (push) history.pushState({ router: true }, "", url.href);

  repaint?.();

  const next = await resolve(document);
  current = next;
  try { next?.mount?.(); } catch (err) { console.error("mount failed:", err); }

  if (scroll) window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  if (url.hash) document.querySelector(url.hash)?.scrollIntoView();

  document.dispatchEvent(new CustomEvent("alafi:navigated", { detail: { url: url.href } }));
}

async function go(url, options) {
  if (navigating) return;
  navigating = true;
  document.documentElement.classList.add("is-navigating");
  try {
    await render(url, options);
  } catch (err) {
    // Never strand the visitor on a half-swapped page.
    console.warn("Router falling back to a full load:", err);
    location.href = url.href;
    return;
  } finally {
    navigating = false;
    document.documentElement.classList.remove("is-navigating");
  }
}

/* ------------------------------------------------------------------ */
/*  Wiring                                                             */
/* ------------------------------------------------------------------ */

export function initRouter(options) {
  resolve = options.resolvePage;
  repaint = options.repaint;
  current = options.initial || null;

  if (!window.history?.pushState || !window.DOMParser || !window.fetch) return;

  document.addEventListener("click", (event) => {
    const link = event.target.closest?.("a[href]");
    if (!link) return;
    const url = isInternal(link, event);
    if (!url) return;
    event.preventDefault();
    if (url.href === location.href) return;
    go(url);
  });

  window.addEventListener("popstate", () => {
    go(new URL(location.href), { push: false, scroll: false });
  });

  history.replaceState({ router: true }, "", location.href);
}

/** Lets a page module hand the router a new mount without a navigation. */
export function setCurrentPage(module) {
  current = module;
}
