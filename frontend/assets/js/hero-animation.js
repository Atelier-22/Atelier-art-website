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

  var COLLECTIONS = [
    ["paintings", "painting", 20],
    ["sketches", "sketch", 20],
    ["digital", "digital", 20],
    ["sculptures", "sculpture", 20],
    ["portraits", "portrait", 20],
    ["graphics", "graphic", 20],
    ["comics", "comic", 3]
  ];

  var T = {
    wordStagger: 0.095,
    wordDuration: 0.3,
    entry: 0.9,
    fanAt: 0.9,
    fanDuration: 0.14,
    ctaAt: 1.05,
    subtitleAt: 1.2,
    statsAt: 1.32,
    cueAt: 1.45,
    idleDelay: 2.2,
    idleEvery: 3.4,
    idleFade: 1.6,
    entryImageWait: 1200
  };

  function slice(list) { return Array.prototype.slice.call(list); }

  function bail() {
    bailed = true;
    root.classList.remove(CLASS);
    if (current) { current(); current = null; }
  }

  function seeds(collection) {
    var out = [];
    for (var i = 1; i <= collection[2]; i++) out.push("artworks/" + collection[0] + "/" + collection[1] + i + ".jpg");
    return out;
  }

  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function choosePieces(exclude, count) {
    var lists = COLLECTIONS.map(function (c) {
      return seeds(c).filter(function (s) { return !exclude[s]; });
    });
    var picks = [];
    shuffle(lists.map(function (_, i) { return i; })).forEach(function (i) {
      if (picks.length >= count || !lists[i].length) return;
      picks.push(lists[i][Math.floor(Math.random() * lists[i].length)]);
    });
    var used = {};
    picks.forEach(function (s) { used[s] = true; });
    var rest = [];
    lists.forEach(function (l) { l.forEach(function (s) { if (!used[s]) rest.push(s); }); });
    return { picks: picks, pool: shuffle(rest) };
  }

  function wrapWord(node) {
    var word = document.createElement("span");
    word.className = "hero-word";
    word.appendChild(node);
    return word;
  }

  function splitWords(line) {
    if (line.querySelector(".hero-word")) return;
    var frag = document.createDocumentFragment();
    slice(line.childNodes).forEach(function (node) {
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

  function preload(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { if (img.decode) img.decode().then(resolve, resolve); else resolve(); };
      img.onerror = resolve;
      img.src = src;
    });
  }

  function fanGeometry(cardsEl) {
    var cs = window.getComputedStyle(cardsEl);
    return {
      spread: parseFloat(cs.getPropertyValue("--fan-spread")) || 44,
      rotate: parseFloat(cs.getPropertyValue("--fan-rotate")) || 7,
      drop: parseFloat(cs.getPropertyValue("--fan-drop")) || 4
    };
  }

  function fanPose(k, geo) {
    return { xPercent: k * geo.spread, yPercent: Math.abs(k) * geo.drop, rotation: k * geo.rotate, x: 0, y: 0 };
  }

  function compose(gsap, el) {
    var tl = gsap.timeline({ defaults: { ease: "power2.out" } });

    if (el.eyebrow) {
      tl.fromTo(el.eyebrow, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.5 }, 0);
    }
    if (el.words.length) {
      tl.fromTo(el.words, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: T.wordDuration, stagger: T.wordStagger }, 0);
    }

    var cards = el.cards;
    if (cards.length) {
      var center = el.center;
      var geo = el.fan;
      cards.forEach(function (card, i) {
        gsap.set(card, { zIndex: cards.length - Math.abs(i - center), transformOrigin: "50% 50%" });
      });
      var others = cards.filter(function (c, i) { return i !== center; });
      if (others.length) tl.set(others, { opacity: 0, xPercent: 0, yPercent: 0, rotation: -4, x: 0, y: 0 }, 0);
      tl.fromTo(cards[center],
        { opacity: 1, xPercent: 0, yPercent: 0, x: -(el.vw * 0.6 + el.cardW), y: el.vh * 0.45, rotation: -36 },
        { x: 0, y: 0, rotation: -4, duration: T.entry, ease: "power3.out" },
        0);
      if (others.length) tl.set(others, { opacity: 1 }, T.fanAt);
      cards.forEach(function (card, i) {
        var k = i - center;
        var pose = fanPose(k, geo);
        pose.duration = T.fanDuration;
        pose.ease = "power2.out";
        tl.to(card, pose, T.fanAt + (Math.abs(k) > 1 ? 0.02 : 0));
      });
    }

    if (el.cta) tl.fromTo(el.cta, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3 }, T.ctaAt);
    if (el.blurb) tl.fromTo(el.blurb, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3 }, T.subtitleAt);
    if (el.stats) tl.fromTo(el.stats, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3 }, T.statsAt);
    if (el.cue) tl.fromTo(el.cue, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4 }, T.cueAt);

    return tl;
  }

  function mount(hero) {
    var gsap = window.gsap;
    var h1 = hero.querySelector("h1");
    var lines = h1 ? slice(h1.querySelectorAll("[data-cfg-html]")) : [];
    var cardsEl = hero.querySelector(".hero-cards");
    var cards = cardsEl ? slice(cardsEl.querySelectorAll(".hero-card")) : [];
    var center = Math.floor(cards.length / 2);
    var state = { timeline: null, done: false, idle: false, timer: null, breathing: [], ready: false, dead: false, waiting: null };
    var observers = [];
    var resizeTimer = null;

    var exclude = {};
    slice(hero.querySelectorAll(".hero-canvas img")).forEach(function (img) { exclude[img.getAttribute("src")] = true; });
    var chosen = choosePieces(exclude, cards.length);
    var pool = chosen.pool;
    var slots = [center].concat(cards.map(function (_, i) { return i; }).filter(function (i) { return i !== center; }));
    slots.forEach(function (slot, n) {
      var src = chosen.picks[n];
      var card = cards[slot];
      if (!src || !card) return;
      var img = document.createElement("img");
      img.alt = "";
      img.decoding = "async";
      img.setAttribute("fetchpriority", n === 0 ? "high" : "auto");
      img.src = src;
      card.textContent = "";
      card.appendChild(img);
    });

    function collect() {
      lines.forEach(splitWords);
      if (h1) h1.classList.add("is-split");
      return {
        eyebrow: hero.querySelector(".eyebrow"),
        words: h1 ? slice(h1.querySelectorAll(".hero-word")) : [],
        cards: cards,
        center: center,
        fan: cardsEl ? fanGeometry(cardsEl) : null,
        cardW: cardsEl ? cardsEl.offsetWidth : 0,
        vw: window.innerWidth,
        vh: window.innerHeight,
        cta: hero.querySelector(".hero-cta"),
        blurb: hero.querySelector(".hero-foot > p"),
        stats: hero.querySelector(".hero-meta"),
        cue: hero.querySelector(".scroll-cue")
      };
    }

    function breathe() {
      state.breathing.forEach(function (t) { t.kill(); });
      state.breathing = cards.map(function (card, i) {
        return gsap.to(card, { rotation: "+=1.4", y: "+=4", duration: 5.5 + i * 0.6, yoyo: true, repeat: -1, ease: "sine.inOut", delay: i * 0.45 });
      });
    }

    function showing(src) {
      return cards.some(function (card) {
        var img = card.querySelector("img");
        return img && img.getAttribute("src") === src;
      });
    }

    function nextPiece() {
      for (var tries = 0; tries < pool.length + 1; tries++) {
        if (!pool.length) return null;
        if (state.next >= pool.length) { pool = shuffle(pool); state.next = 0; }
        var src = pool[state.next++];
        if (!showing(src)) return src;
      }
      return null;
    }

    function startIdle() {
      if (state.idle || !cards.length) return;
      state.idle = true;
      state.next = 0;
      breathe();
      var slot = 0;
      function tick() {
        if (!state.idle) return;
        var card = cards[slot];
        slot = (slot + 1) % cards.length;
        var src = nextPiece();
        if (src) {
          preload(src).then(function () {
            if (!state.idle) return;
            var base = card.querySelector("img");
            var top = card.querySelector(".hero-card-next");
            if (!top) {
              top = document.createElement("img");
              top.className = "hero-card-next";
              top.alt = "";
              top.decoding = "async";
              card.appendChild(top);
            }
            top.src = src;
            gsap.fromTo(top, { opacity: 0 }, {
              opacity: 1,
              duration: T.idleFade,
              ease: "sine.inOut",
              onComplete: function () {
                if (base) base.src = src;
                gsap.set(top, { opacity: 0 });
              }
            });
          });
        }
        state.timer = gsap.delayedCall(T.idleEvery, tick);
      }
      state.timer = gsap.delayedCall(T.idleDelay, tick);
    }

    function build(at) {
      if (state.timeline) state.timeline.kill();
      state.timeline = compose(gsap, collect());
      state.timeline.eventCallback("onComplete", function () { state.done = true; startIdle(); });
      if (at) state.timeline.time(Math.min(at, state.timeline.duration()));
      observers.forEach(function (o) { o.takeRecords(); });
    }

    function resync() {
      if (!state.ready) return;
      var changed = lines.some(function (line) { return !line.querySelector(".hero-word"); });
      if (!changed) return;
      if (state.done) {
        lines.forEach(splitWords);
        gsap.set(h1.querySelectorAll(".hero-word"), { opacity: 1, y: 0 });
        observers.forEach(function (o) { o.takeRecords(); });
        return;
      }
      build(state.timeline ? state.timeline.time() : 0);
    }

    function relayout() {
      if (!state.idle || !cardsEl) return;
      state.breathing.forEach(function (t) { t.kill(); });
      var geo = fanGeometry(cardsEl);
      cards.forEach(function (card, i) { gsap.set(card, fanPose(i - center, geo)); });
      breathe();
    }

    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(relayout, 200);
    }

    function start() {
      if (state.dead || state.ready) return;
      clearTimeout(state.waiting);
      state.ready = true;
      build(0);
    }

    if (window.MutationObserver) {
      lines.forEach(function (node) {
        var observer = new MutationObserver(resync);
        observer.observe(node, { childList: true });
        observers.push(observer);
      });
    }
    window.addEventListener("resize", onResize);

    var entry = cards[center] && cards[center].querySelector("img");
    if (entry) {
      state.waiting = setTimeout(start, T.entryImageWait);
      preload(entry.getAttribute("src")).then(start);
    } else {
      start();
    }

    return function teardown() {
      state.dead = true;
      clearTimeout(state.waiting);
      window.removeEventListener("resize", onResize);
      clearTimeout(resizeTimer);
      observers.forEach(function (o) { o.disconnect(); });
      observers = [];
      state.idle = false;
      if (state.timer) { state.timer.kill(); state.timer = null; }
      state.breathing.forEach(function (t) { t.kill(); });
      state.breathing = [];
      cards.forEach(function (card) { gsap.killTweensOf(card.querySelectorAll("img")); });
      gsap.killTweensOf(cards);
      if (state.timeline) { state.timeline.kill(); state.timeline = null; }
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
