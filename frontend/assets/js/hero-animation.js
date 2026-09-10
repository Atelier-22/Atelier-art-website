(function () {
  "use strict";

  var root = document.documentElement;
  var CLASS = "hero-anim";

  var reduced = false;
  try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { reduced = false; }
  if (reduced) return;

  root.classList.add(CLASS);

  var started = false;
  var bailed = false;
  var gsapFailed = false;
  var current = null;

  function bail() {
    bailed = true;
    root.classList.remove(CLASS);
    if (current) { current(); current = null; }
  }

  var POSES = [
    { r: -4,  x: 0,   y: 0  },
    { r: 7,   x: 10,  y: -6 },
    { r: -11, x: -12, y: 5  },
    { r: 13,  x: 18,  y: 9  }
  ];

  function wrapWord(node) {
    var word = document.createElement("span");
    word.className = "hero-word";
    word.appendChild(node);
    return word;
  }

  function splitWords(line) {
    if (line.querySelector(".hero-word")) return;
    var frag = document.createDocumentFragment();
    Array.prototype.slice.call(line.childNodes).forEach(function (node) {
      if (node.nodeType === 3) {
        node.nodeValue.split(/(\s+)/).forEach(function (piece) {
          if (!piece) return;
          if (/^\s+$/.test(piece)) frag.appendChild(document.createTextNode(" "));
          else frag.appendChild(wrapWord(document.createTextNode(piece)));
        });
      } else if (node.nodeType === 1) {
        frag.appendChild(wrapWord(node));
      }
    });
    line.textContent = "";
    line.appendChild(frag);
  }

  function compose(gsap, el) {
    var tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    var rise = el.wordRise || 24;

    if (el.eyebrow) {
      tl.fromTo(el.eyebrow, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.8 }, 0);
    }

    var headlineEnd = 0.6;
    if (el.words.length) {
      tl.fromTo(el.words,
        { opacity: 0, y: rise, filter: "blur(12px)" },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.9, stagger: 0.08, clearProps: "filter" },
        0.15);
      headlineEnd = 0.15 + 0.9 + 0.08 * (el.words.length - 1);
    }

    var footAt = headlineEnd - 0.2;

    if (el.cards.length) {
      var front = POSES[0];
      var swingAt = Math.max(0.4, headlineEnd - 0.55);

      el.cards.forEach(function (img, i) {
        gsap.set(img, { zIndex: el.cards.length - i, transformOrigin: "50% 60%" });
      });

      tl.fromTo(el.cards[0],
        { opacity: 0, rotation: -24, xPercent: -30, yPercent: 18, scale: 0.9 },
        { opacity: 1, rotation: front.r, xPercent: front.x, yPercent: front.y, scale: 1,
          duration: 1.5, ease: "elastic.out(1, 0.55)" },
        swingAt);

      var fanAt = swingAt + 0.55;
      var rest = el.cards.slice(1);
      rest.forEach(function (img, i) {
        var pose = POSES[(i + 1) % POSES.length];
        tl.fromTo(img,
          { opacity: 0, rotation: front.r, xPercent: front.x, yPercent: front.y, scale: 0.86 },
          { opacity: 1, rotation: pose.r, xPercent: pose.x, yPercent: pose.y, scale: 1,
            duration: 0.9, ease: "back.out(1.7)" },
          fanAt + i * 0.1);
      });

      var fanEnd = rest.length ? fanAt + 0.9 + 0.1 * (rest.length - 1) : swingAt + 1.0;
      footAt = fanEnd - 0.25;
    }

    var foot = [el.blurb, el.stats].filter(Boolean);
    if (foot.length) {
      tl.fromTo(foot, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.12 }, footAt);
    }
    if (el.cue) {
      tl.fromTo(el.cue, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.8 }, footAt + 0.25);
    }

    return tl;
  }

  function mount(hero) {
    var gsap = window.gsap;
    var h1 = hero.querySelector("h1");
    var lines = h1 ? Array.prototype.slice.call(h1.querySelectorAll("[data-cfg-html]")) : [];
    var canvas = hero.querySelector(".hero-canvas");
    var timeline = null;
    var observers = [];

    function collect() {
      lines.forEach(splitWords);
      if (h1) h1.classList.add("is-split");
      var fontSize = h1 ? parseFloat(window.getComputedStyle(h1).fontSize) || 80 : 80;
      return {
        eyebrow: hero.querySelector(".eyebrow"),
        words: h1 ? Array.prototype.slice.call(h1.querySelectorAll(".hero-word")) : [],
        wordRise: fontSize * 0.3,
        cards: canvas ? Array.prototype.slice.call(canvas.querySelectorAll("img")) : [],
        blurb: hero.querySelector(".hero-foot > p"),
        stats: hero.querySelector(".hero-meta"),
        cue: hero.querySelector(".scroll-cue")
      };
    }

    function build(at) {
      if (timeline) timeline.kill();
      timeline = compose(gsap, collect());
      if (at) timeline.time(Math.min(at, timeline.duration()));
      observers.forEach(function (o) { o.takeRecords(); });
    }

    function resync() {
      var changed = lines.some(function (line) { return !line.querySelector(".hero-word"); })
        || (canvas && Array.prototype.some.call(canvas.querySelectorAll("img"), function (img) {
          return !img.style.zIndex;
        }));
      if (!changed) return;
      build(timeline ? timeline.time() : 0);
    }

    if (window.MutationObserver) {
      lines.concat(canvas ? [canvas] : []).forEach(function (node) {
        var observer = new MutationObserver(resync);
        observer.observe(node, { childList: true });
        observers.push(observer);
      });
    }

    build(0);

    return function teardown() {
      observers.forEach(function (o) { o.disconnect(); });
      observers = [];
      if (timeline) { timeline.kill(); timeline = null; }
    };
  }

  function run() {
    if (started || bailed) return;
    started = true;
    var hero = document.querySelector(".hero");
    if (!window.gsap || !hero) { bail(); return; }
    current = mount(hero);
  }

  function check() {
    if (started) return;
    if (document.readyState === "loading") return;
    if (!window.gsap && !gsapFailed) return;
    run();
  }

  document.addEventListener("readystatechange", check);
  document.addEventListener("DOMContentLoaded", check);

  var gsapTag = document.querySelector('script[src*="gsap"]');
  if (gsapTag && !window.gsap) {
    gsapTag.addEventListener("load", check);
    gsapTag.addEventListener("error", function () { gsapFailed = true; check(); });
  }

  setTimeout(function () { if (!started) bail(); }, 6000);

  document.addEventListener("alafi:navigated", function () {
    if (bailed) return;
    if (current) { current(); current = null; }
    var hero = document.querySelector(".hero");
    if (hero && window.gsap) current = mount(hero);
  });
})();
