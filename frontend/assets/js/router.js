const PERSIST = "[data-persist]";

let current = null;
let resolve = null;
let repaint = null;
let navigating = false;


function isInternal(link, event) {
  if (event.defaultPrevented) return false;
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (!link || link.target === "_blank" || link.hasAttribute("download")) return false;
  if (link.dataset.noRouter !== undefined) return false;

  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin) return false;
  if (!/\.html$/.test(url.pathname) && url.pathname !== "/") return false;

  if (url.pathname === location.pathname && url.search === location.search && url.hash) return false;

  if (/admin\.html$/.test(url.pathname)) return false;

  return url;
}


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
  const kept = [...document.body.querySelectorAll(PERSIST)];
  kept.forEach(node => node.remove());

  document.body.innerHTML = "";

  [...document.body.attributes].forEach(attr => document.body.removeAttribute(attr.name));
  [...incoming.body.attributes].forEach(attr => document.body.setAttribute(attr.name, attr.value));

  [...incoming.body.children].forEach((node) => {
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
    console.warn("Router falling back to a full load:", err);
    location.href = url.href;
    return;
  } finally {
    navigating = false;
    document.documentElement.classList.remove("is-navigating");
  }
}


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

export function setCurrentPage(module) {
  current = module;
}
