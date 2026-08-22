const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let revealObserver = null;

function ensureObserver() {
  if (revealObserver) return revealObserver;
  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-revealed");
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
  return revealObserver;
}

export function observeReveals(root = document) {
  const targets = root.querySelectorAll("[data-reveal]:not(.is-revealed), .reveal-mask:not(.is-revealed)");
  if (reduced) {
    targets.forEach(el => el.classList.add("is-revealed"));
    return;
  }
  const observer = ensureObserver();
  targets.forEach(el => observer.observe(el));
}

const scrollHandlers = new Set();
let ticking = false;

function flush() {
  ticking = false;
  const vh = window.innerHeight;
  scrollHandlers.forEach(fn => fn(vh));
}

function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(flush);
}

export function onScrollFrame(fn) {
  if (reduced) return () => {};
  if (!scrollHandlers.size) {
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
  }
  scrollHandlers.add(fn);
  onScroll();
  return () => scrollHandlers.delete(fn);
}

export function sectionProgress(el, vh) {
  const rect = el.getBoundingClientRect();
  const span = rect.height + vh;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (vh - rect.top) / span));
}

export function initNav() {
  const nav = document.querySelector(".site-nav");
  if (!nav) return;
  const toggle = nav.querySelector(".nav-toggle");
  const links = nav.querySelector(".nav-links");

  const sync = () => nav.classList.toggle("is-stuck", window.scrollY > 40);
  window.addEventListener("scroll", sync, { passive: true });
  sync();

  if (toggle && links) {
    toggle.addEventListener("click", () => {
      const open = links.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.textContent = open ? "Close" : "Menu";
    });
    links.addEventListener("click", (e) => {
      if (e.target.tagName !== "A") return;
      links.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.textContent = "Menu";
    });
  }
}

export const prefersReducedMotion = reduced;
