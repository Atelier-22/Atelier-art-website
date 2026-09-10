(function () {
  "use strict";

  var root = document.documentElement;
  var VERSION = "20260823a";

  var reduced = false;
  try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { reduced = false; }
  var CLASS = reduced ? "hero-still" : "hero-anim";
  root.classList.add(CLASS);

  var started = false;
  var bailed = false;
  var gsapFailed = false;
  var current = null;

  var FALLBACK = [
    ["paintings", "Paintings", "painting", 20],
    ["sketches", "Sketches", "sketch", 20],
    ["digital", "Digital Art", "digital", 20],
    ["sculptures", "Sculptures", "sculpture", 20],
    ["portraits", "Portraits", "portrait", 20],
    ["graphics", "Graphics", "graphic", 20],
    ["comics", "Comics", "comic", 3]
  ];

  var TIERS = [
    { name: "mobile", max: 700, cards: 4, tags: 1, scale: 0.9 },
    { name: "tablet", max: 999, cards: 5, tags: 1, scale: 0.95 },
    { name: "desktop", max: Infinity, cards: 7, tags: 2, scale: 1 }
  ];

  var LAYOUTS = {
    wall: [
      [50, 47, -2, 1, 5, 0],
      [19, 30, -8, 0.72, 3, 6],
      [81, 27, 7, 0.7, 3, -6],
      [15, 74, 5, 0.66, 2, 5],
      [84, 72, -6, 0.68, 2, -5],
      [50, 88, 3, 0.58, 1, 0],
      [50, 8, -4, 0.54, 1, 0]
    ],
    market: [
      [36, 42, -5, 0.88, 4, 3],
      [70, 34, 6, 0.8, 4, -4],
      [22, 78, 4, 0.66, 3, 5],
      [60, 76, -7, 0.72, 3, -3],
      [88, 64, 8, 0.6, 2, -6],
      [10, 32, -10, 0.56, 2, 7],
      [86, 12, 3, 0.52, 1, -5]
    ],
    feature: [
      [50, 50, 0, 1.18, 6, 0],
      [16, 24, -9, 0.5, 2, 7],
      [84, 22, 8, 0.52, 2, -7],
      [12, 78, 6, 0.48, 2, 6],
      [88, 78, -7, 0.5, 2, -6],
      [50, 93, 2, 0.42, 1, 0],
      [50, 6, -3, 0.4, 1, 0]
    ],
    artist: [
      [38, 50, -3, 1.06, 6, 3],
      [78, 30, 8, 0.7, 3, -6],
      [80, 74, -5, 0.66, 3, -5],
      [14, 16, -8, 0.5, 2, 6],
      [16, 84, 6, 0.48, 2, 5],
      [50, 92, 2, 0.44, 1, 0],
      [50, 6, -3, 0.42, 1, 0]
    ],
    fan: [
      [50, 50, 0, 1, 5, 0],
      [32, 52, -9, 0.92, 4, 4],
      [68, 52, 9, 0.92, 4, -4],
      [16, 58, -16, 0.82, 3, 6],
      [84, 58, 16, 0.82, 3, -6],
      [50, 90, 3, 0.5, 1, 0],
      [50, 8, -2, 0.46, 1, 0]
    ]
  };

  var STATES = [
    { key: "intro", text: 0, layout: "wall", count: 1, hold: 2.8, tags: 0 },
    { key: "collection", text: 0, layout: "wall", count: 0, hold: 3.2, tags: 2 },
    { key: "market", text: 1, layout: "market", count: 0, hold: 3.4, tags: 1 },
    { key: "discover", text: 2, layout: "feature", count: -1, hold: 3.6, tags: 1, featuredNew: true },
    { key: "artists", text: 3, layout: "artist", count: -2, hold: 3.6, tags: 2, featuredNew: true },
    { key: "world", text: "h1", layout: "fan", count: -2, hold: 4.2, tags: 0 }
  ];

  var RECENT_LIMIT = 24;

  function slice(list) { return Array.prototype.slice.call(list); }

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

  function rand(min, max) { return min + Math.random() * (max - min); }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function bail() {
    bailed = true;
    root.classList.remove(CLASS);
    if (current) { current(); current = null; }
  }

  function wrapWord(node) {
    var word = document.createElement("span");
    word.className = "hero-word";
    word.appendChild(node);
    return word;
  }

  function splitWords(line) {
    if (!line || line.querySelector(".hero-word")) return;
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

  function wordsOf(el) { return el ? slice(el.querySelectorAll(".hero-word")) : []; }

  function preload(piece) {
    if (piece.loaded) return Promise.resolve(piece);
    if (piece.loading) return piece.loading;
    piece.loading = new Promise(function (resolve) {
      var img = new Image();
      img.decoding = "async";
      var done = function (ok) {
        piece.loading = null;
        if (ok && img.naturalWidth) {
          piece.loaded = true;
          piece.ar = clamp(img.naturalWidth / img.naturalHeight, 0.7, 1.4);
        } else {
          piece.failed = true;
        }
        resolve(piece);
      };
      img.onload = function () { if (img.decode) img.decode().then(function () { done(true); }, function () { done(true); }); else done(true); };
      img.onerror = function () { done(false); };
      img.src = piece.src;
    });
    return piece.loading;
  }

  function fallbackPieces(exclude) {
    var out = [];
    FALLBACK.forEach(function (c) {
      for (var i = 1; i <= c[3]; i++) {
        var src = "artworks/" + c[0] + "/" + c[2] + i + ".jpg";
        if (!exclude[src]) out.push({ src: src, category: c[0], label: c[1], title: "" });
      }
    });
    return out;
  }

  function loadPieces(exclude) {
    return import("./assets/js/site-data.js?v=" + VERSION).then(function (m) {
      var out = [];
      m.DEFAULT_ART_CATEGORIES.forEach(function (c) {
        (c.seeds || []).forEach(function (src) {
          if (!exclude[src]) out.push({ src: src, category: c.slug, label: c.label, title: "" });
        });
      });
      return out.length ? out : fallbackPieces(exclude);
    }).catch(function () { return fallbackPieces(exclude); });
  }

  function loadUploads(labels) {
    return Promise.all([
      import("./firebase-config.js?v=" + VERSION),
      import("./assets/js/cloudinary.js?v=" + VERSION)
    ]).then(function (mods) {
      return mods[0].fetchUploadedArtworks().then(function (byCategory) {
        var out = [];
        Object.keys(byCategory || {}).forEach(function (slug) {
          byCategory[slug].forEach(function (a) {
            if (!a.imageUrl) return;
            out.push({
              src: mods[1].withTransform(a.imageUrl, "f_auto,q_auto,w_900,c_limit"),
              category: slug,
              label: labels[slug] || slug,
              title: a.title || ""
            });
          });
        });
        return out;
      });
    }).catch(function () { return []; });
  }

  function Library(exclude) {
    var pieces = [];
    var recent = [];
    var queue = [];
    var labels = {};

    function absorb(list) {
      var seen = {};
      pieces.forEach(function (p) { seen[p.src] = true; });
      list.forEach(function (p) {
        if (seen[p.src]) return;
        seen[p.src] = true;
        pieces.push(p);
        labels[p.category] = p.label;
      });
    }

    function categories() {
      var set = {};
      pieces.forEach(function (p) { set[p.category] = true; });
      return Object.keys(set);
    }

    function nextCategory(avoidCats) {
      if (!queue.length) queue = shuffle(categories());
      for (var i = 0; i < queue.length; i++) {
        if (avoidCats[queue[i]]) continue;
        return queue.splice(i, 1)[0];
      }
      return queue.shift();
    }

    function remember(piece) {
      recent.push(piece.src);
      if (recent.length > RECENT_LIMIT) recent.shift();
    }

    function pick(count, avoidSrcs) {
      var out = [];
      var usedCats = {};
      var avoid = {};
      (avoidSrcs || []).forEach(function (s) { avoid[s] = true; });
      recent.forEach(function (s) { avoid[s] = true; });
      var guard = 0;
      while (out.length < count && guard++ < 40) {
        var cat = nextCategory(usedCats);
        if (!cat) break;
        var options = pieces.filter(function (p) { return p.category === cat && !p.failed && !avoid[p.src]; });
        if (!options.length) options = pieces.filter(function (p) { return p.category === cat && !p.failed && !(avoidSrcs || []).some(function (s) { return s === p.src; }); });
        if (!options.length) continue;
        var piece = options[Math.floor(Math.random() * options.length)];
        avoid[piece.src] = true;
        usedCats[cat] = true;
        if (Object.keys(usedCats).length >= categories().length) usedCats = {};
        out.push(piece);
        remember(piece);
      }
      return out;
    }

    return {
      absorb: absorb,
      pick: pick,
      labels: labels,
      size: function () { return pieces.length; },
      load: function () {
        return loadPieces(exclude).then(function (seeds) {
          absorb(seeds);
          loadUploads(labels).then(function (uploads) { absorb(uploads); });
          return pieces;
        });
      }
    };
  }

  function tierFor(width) {
    for (var i = 0; i < TIERS.length; i++) if (width <= TIERS[i].max) return TIERS[i];
    return TIERS[TIERS.length - 1];
  }

  function slotsFor(state, tier) {
    var base = LAYOUTS[state.layout];
    var count = state.count > 0 ? state.count : Math.max(3, tier.cards + state.count);
    count = Math.min(count, base.length);
    return base.slice(0, count).map(function (s, i) {
      var jitter = i === 0 ? 0.4 : 1;
      return {
        x: clamp(s[0] + rand(-3, 3) * jitter, 8, 92),
        y: clamp(s[1] + rand(-3, 3) * jitter, 6, 94),
        r: s[2] + rand(-2.5, 2.5) * jitter,
        s: (s[3] + rand(-0.03, 0.03) * jitter) * tier.scale,
        z: s[4],
        ry: s[5] + rand(-2, 2)
      };
    });
  }

  function poseOf(slot, w, h) {
    return {
      x: (slot.x / 100 - 0.5) * w,
      y: (slot.y / 100 - 0.5) * h,
      rotation: slot.r,
      rotationY: slot.ry,
      scale: slot.s,
      zIndex: slot.z,
      opacity: 1
    };
  }

  function sideOf(slot) {
    if (slot.x < 40) return "left";
    if (slot.x > 60) return "right";
    return slot.y > 55 ? "bottom" : "top";
  }

  function entryFrom(slot, pose, w, h, variant) {
    var side = sideOf(slot);
    var from = { opacity: 0, scale: pose.scale * 0.84, rotationY: pose.rotationY * 2, x: pose.x, y: pose.y, rotation: pose.rotation };
    if (variant === "spin") {
      from.rotation = pose.rotation + (side === "right" ? 22 : -22);
      from.scale = pose.scale * 0.66;
      from.y = pose.y + h * 0.12;
      return from;
    }
    if (side === "left") { from.x = pose.x - w * 0.55; from.y = pose.y + rand(-h * 0.12, h * 0.18); from.rotation = pose.rotation - 12; }
    else if (side === "right") { from.x = pose.x + w * 0.55; from.y = pose.y + rand(-h * 0.12, h * 0.18); from.rotation = pose.rotation + 12; }
    else if (side === "bottom") { from.y = pose.y + h * 0.5; from.rotation = pose.rotation + 6; }
    else { from.y = pose.y - h * 0.45; from.rotation = pose.rotation - 6; }
    return from;
  }

  function exitTo(slot, pose, w, h) {
    var side = sideOf(slot);
    var to = { opacity: 0, scale: pose.scale * 0.9, duration: 0.75, ease: "power2.in" };
    if (side === "left") { to.x = pose.x - w * 0.6; to.rotation = pose.rotation - 10; }
    else if (side === "right") { to.x = pose.x + w * 0.6; to.rotation = pose.rotation + 10; }
    else if (side === "bottom") { to.y = pose.y + h * 0.55; to.rotation = pose.rotation + 5; }
    else { to.y = pose.y - h * 0.5; to.rotation = pose.rotation - 5; }
    return to;
  }

  function Headline(copy, gsap) {
    var h1 = copy.querySelector("h1");
    var story = copy.querySelector(".hero-story");
    var spans = story ? slice(story.children) : [];
    var lines = h1 ? slice(h1.querySelectorAll("[data-cfg-html]")) : [];
    var active = null;
    if (story) story.hidden = false;
    spans.forEach(splitWords);
    lines.forEach(splitWords);

    function elementFor(target) {
      if (target === "h1") return h1;
      return spans[target] || h1;
    }

    function show(target, tl, at) {
      var el = elementFor(target);
      if (!el || el === active) return;
      if (active) {
        var outgoing = wordsOf(active);
        var leaving = active;
        tl.to(outgoing, { opacity: 0, y: -16, duration: 0.42, stagger: 0.03, ease: "power2.in" }, at);
        tl.call(function () { gsap.set(leaving, { opacity: 0 }); }, null, at + 0.42 + 0.03 * outgoing.length);
      }
      tl.set(el, { opacity: 1 }, at + 0.2);
      tl.fromTo(wordsOf(el), { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.06, ease: "power3.out" }, at + 0.25);
      active = el;
    }

    function resync() {
      var changed = lines.some(function (line) { return !line.querySelector(".hero-word"); });
      if (!changed) return;
      lines.forEach(splitWords);
      gsap.set(wordsOf(h1), active === h1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 });
    }

    return { show: show, resync: resync, lines: lines, h1: h1 };
  }

  function mount(hero) {
    var gsap = window.gsap;
    var stage = hero.querySelector(".hero-stage");
    var copy = hero.querySelector(".hero-copy") || hero;
    var cards = stage ? slice(stage.querySelectorAll(".hero-card")) : [];
    var els = {
      eyebrow: hero.querySelector(".eyebrow"),
      cta: hero.querySelector(".hero-cta"),
      blurb: hero.querySelector(".hero-foot > p"),
      stats: hero.querySelector(".hero-meta"),
      cue: hero.querySelector(".scroll-cue")
    };
    var exclude = {};
    slice(hero.querySelectorAll(".hero-canvas img")).forEach(function (img) { exclude[img.getAttribute("src")] = true; });

    var library = Library(exclude);
    var headline = Headline(copy, gsap);
    var state = { dead: false, index: -1, active: [], free: cards.slice(), prepared: [], token: 0, timer: null, tl: null, slots: [], visible: true, waiting: null, firstPiece: null };
    var observers = [];
    var resizeTimer = null;

    function stageSize() {
      var r = stage.getBoundingClientRect();
      return { w: r.width || 1, h: r.height || 1 };
    }

    function assign(el, piece) {
      el.style.setProperty("--ar", String(piece.ar || 0.8));
      var img = el.querySelector("img");
      if (!img) {
        img = document.createElement("img");
        img.alt = "";
        img.decoding = "async";
        el.appendChild(img);
      }
      var tag = el.querySelector(".hero-tag");
      if (!tag) {
        tag = document.createElement("figcaption");
        tag.className = "hero-tag";
        el.appendChild(tag);
      }
      el.classList.toggle("is-ready", !!piece.loaded);
      if (!piece.loaded) {
        img.onload = function () { el.classList.add("is-ready"); };
      } else {
        img.onload = null;
      }
      img.src = piece.src;
      tag.textContent = piece.title || piece.label;
      gsap.set(tag, { opacity: 0, y: 6 });
      gsap.set(el, { xPercent: -50, yPercent: -50, opacity: 0, clearProps: "zIndex" });
    }

    function release(el) {
      gsap.set(el, { opacity: 0 });
      el.classList.remove("is-ready");
      if (state.free.indexOf(el) < 0) state.free.push(el);
    }

    function activeSrcs() { return state.active.map(function (a) { return a.piece.src; }); }

    function prepare(count) {
      var token = ++state.token;
      var picks = library.pick(count, activeSrcs());
      state.prepared = [];
      picks.forEach(function (piece) {
        preload(piece).then(function () {
          if (state.dead || token !== state.token) return;
          if (piece.loaded) state.prepared.push(piece);
        });
      });
    }

    function takePrepared(count) {
      var out = state.prepared.splice(0, count);
      while (out.length < count) {
        var extra = library.pick(1, activeSrcs().concat(out.map(function (p) { return p.src; })));
        if (!extra.length) break;
        out.push(extra[0]);
        preload(extra[0]);
      }
      return out;
    }

    function goTo(index) {
      if (state.dead) return;
      var st = STATES[index];
      var tier = tierFor(window.innerWidth);
      var size = stageSize();
      var slots = slotsFor(st, tier);
      state.index = index;
      state.slots = slots;

      var previous = state.active.slice();
      var reserveFeatured = st.featuredNew || st.key === "intro";
      var keepable = st.key === "intro" ? [] : previous.slice();
      var keepCount = Math.min(keepable.length, Math.floor(slots.length / 2), slots.length - (reserveFeatured ? 1 : 0));
      var keeps = shuffle(keepable).slice(0, Math.max(0, keepCount));
      var exits = previous.filter(function (a) { return keeps.indexOf(a) < 0; });

      var openSlots = slots.map(function (_, i) { return i; });
      if (reserveFeatured) openSlots.shift();
      keeps.sort(function (a, b) { return a.slot.x - b.slot.x; });
      var keepSlots = openSlots.slice().sort(function (a, b) { return slots[a].x - slots[b].x; }).slice(0, keeps.length);
      keepSlots.sort(function (a, b) { return slots[a].x - slots[b].x; });
      var entrantSlots = openSlots.filter(function (i) { return keepSlots.indexOf(i) < 0; });
      if (reserveFeatured) entrantSlots.unshift(0);

      var entrants = st.key === "intro" ? state.prepared.splice(0, 1) : takePrepared(entrantSlots.length);
      var nextActive = [];
      var tl = gsap.timeline({ paused: true });
      state.tl = tl;

      headline.show(st.text, tl, 0);

      exits.forEach(function (a, n) {
        var pose = poseOf(a.slot, size.w, size.h);
        var el = a.el;
        tl.to(el, exitTo(a.slot, pose, size.w, size.h), 0.05 + n * 0.08);
        tl.to(el.querySelector(".hero-tag"), { opacity: 0, duration: 0.2 }, 0.05);
        tl.call(function () { release(el); }, null, 0.05 + n * 0.08 + 0.8);
      });

      keeps.forEach(function (a, n) {
        var slotIndex = keepSlots[n];
        var slot = slots[slotIndex];
        var pose = poseOf(slot, size.w, size.h);
        a.slot = slot;
        a.slotIndex = slotIndex;
        tl.to(a.el, { x: pose.x, y: pose.y, rotation: pose.rotation, rotationY: pose.rotationY, scale: pose.scale, zIndex: pose.zIndex, duration: 1.15, ease: "power3.inOut" }, 0.2 + n * 0.06);
        tl.to(a.el.querySelector(".hero-tag"), { opacity: 0, duration: 0.25 }, 0.1);
        nextActive.push(a);
      });

      entrants.forEach(function (piece, n) {
        var slotIndex = entrantSlots[n];
        var slot = slots[slotIndex];
        var el = state.free.shift();
        if (!el) return;
        assign(el, piece);
        var pose = poseOf(slot, size.w, size.h);
        var featured = slotIndex === 0 && (reserveFeatured || st.key === "intro");
        var at = 0.35 + n * 0.16;
        if (featured) {
          gsap.set(el, { x: pose.x, y: pose.y + size.h * 0.06, rotation: pose.rotation, rotationY: pose.rotationY + 18, scale: pose.scale * 0.62, opacity: 0, zIndex: pose.zIndex });
          tl.to(el, { x: pose.x, y: pose.y, rotation: pose.rotation, rotationY: pose.rotationY, scale: pose.scale, opacity: 1, duration: 1.4, ease: "expo.out" }, st.key === "intro" ? 0.1 : 0.3);
        } else {
          var variant = n % 3 === 2 ? "spin" : "slide";
          var from = entryFrom(slot, pose, size.w, size.h, variant);
          from.zIndex = pose.zIndex;
          gsap.set(el, from);
          tl.to(el, { x: pose.x, y: pose.y, rotation: pose.rotation, rotationY: pose.rotationY, scale: pose.scale, opacity: 1, duration: 1.1, ease: "power3.out" }, at);
        }
        nextActive.push({ el: el, piece: piece, slot: slot, slotIndex: slotIndex });
      });

      if (st.key === "intro" && !entrants.length && state.firstPiece) {
        var pending = state.firstPiece;
        preload(pending).then(function () {
          if (state.dead || state.index !== 0 || !pending.loaded) return;
          var el = state.free.shift();
          if (!el) return;
          assign(el, pending);
          var pose = poseOf(slots[0], size.w, size.h);
          gsap.set(el, { x: pose.x, y: pose.y + size.h * 0.06, rotation: pose.rotation, rotationY: pose.rotationY + 18, scale: pose.scale * 0.62, opacity: 0, zIndex: pose.zIndex });
          gsap.to(el, { x: pose.x, y: pose.y, rotation: pose.rotation, rotationY: pose.rotationY, scale: pose.scale, opacity: 1, duration: 1.4, ease: "expo.out" });
          state.active.push({ el: el, piece: pending, slot: slots[0], slotIndex: 0 });
        });
      }

      var tagged = nextActive.slice().sort(function (a, b) { return a.slotIndex - b.slotIndex; }).slice(0, st.tags);
      tagged.forEach(function (a, n) {
        tl.to(a.el.querySelector(".hero-tag"), { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, 1.3 + n * 0.2);
      });

      if (st.key === "intro") {
        if (els.eyebrow) tl.fromTo(els.eyebrow, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, 0);
        if (els.cta) tl.fromTo(els.cta, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, 1.15);
        if (els.blurb) tl.fromTo(els.blurb, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, 1.3);
        if (els.stats) tl.fromTo(els.stats, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, 1.45);
        if (els.cue) tl.fromTo(els.cue, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, 1.7);
      }

      state.active = nextActive;
      tl.eventCallback("onComplete", function () {
        if (state.dead) return;
        state.timer = gsap.delayedCall(st.hold, advance);
        if (!state.visible) state.timer.pause();
      });
      tl.play();

      var nextIndex = index + 1 < STATES.length ? index + 1 : 1;
      var nextState = STATES[nextIndex];
      var nextSlots = slotsFor(nextState, tier).length;
      prepare(nextSlots);
    }

    function advance() {
      if (state.dead) return;
      goTo(state.index + 1 < STATES.length ? state.index + 1 : 1);
    }

    function relayout() {
      if (state.dead || !state.active.length) return;
      var size = stageSize();
      state.active.forEach(function (a) {
        var pose = poseOf(a.slot, size.w, size.h);
        gsap.to(a.el, { x: pose.x, y: pose.y, scale: pose.scale, duration: 0.6, ease: "power2.out" });
      });
    }

    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(relayout, 200);
    }

    function setVisible(visible) {
      state.visible = visible;
      if (state.timer) { if (visible) state.timer.resume(); else state.timer.pause(); }
      if (state.tl) { if (visible) state.tl.play(); else state.tl.pause(); }
    }

    if (window.MutationObserver) {
      headline.lines.forEach(function (node) {
        var observer = new MutationObserver(headline.resync);
        observer.observe(node, { childList: true });
        observers.push(observer);
      });
    }
    window.addEventListener("resize", onResize);

    var io = null;
    if (window.IntersectionObserver) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) { setVisible(entry.isIntersecting); });
      }, { threshold: 0.05 });
      io.observe(hero);
    }

    function begin() {
      if (state.dead || state.index >= 0) return;
      clearTimeout(state.waiting);
      goTo(0);
    }

    library.load().then(function () {
      if (state.dead) return;
      var first = library.pick(1, []);
      state.firstPiece = first[0] || null;
      state.prepared = [];
      begin();
    });

    return function teardown() {
      state.dead = true;
      clearTimeout(state.waiting);
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      if (io) io.disconnect();
      observers.forEach(function (o) { o.disconnect(); });
      observers = [];
      if (state.timer) { state.timer.kill(); state.timer = null; }
      if (state.tl) { state.tl.kill(); state.tl = null; }
      cards.forEach(function (card) { gsap.killTweensOf(card); gsap.killTweensOf(card.querySelectorAll(".hero-tag")); });
    };
  }

  function stillMount(hero) {
    var stage = hero.querySelector(".hero-stage");
    var cards = stage ? slice(stage.querySelectorAll(".hero-card")) : [];
    var exclude = {};
    slice(hero.querySelectorAll(".hero-canvas img")).forEach(function (img) { exclude[img.getAttribute("src")] = true; });
    var library = Library(exclude);
    var dead = false;
    library.load().then(function () {
      if (dead) return;
      var picks = library.pick(Math.min(5, cards.length), []);
      picks.forEach(function (piece, i) {
        var el = cards[i];
        var img = document.createElement("img");
        img.alt = "";
        img.decoding = "async";
        img.onload = function () { el.classList.add("is-ready"); };
        img.src = piece.src;
        var tag = document.createElement("figcaption");
        tag.className = "hero-tag";
        tag.textContent = piece.title || piece.label;
        el.appendChild(img);
        el.appendChild(tag);
      });
    });
    return function teardown() { dead = true; };
  }

  function run() {
    if (started || bailed) return;
    started = true;
    var hero = document.querySelector(".hero");
    if (!hero) { bail(); return; }
    if (reduced) { current = stillMount(hero); return; }
    if (!window.gsap) { bail(); return; }
    current = mount(hero);
  }

  function check() {
    if (started) return;
    if (document.readyState === "loading") return;
    if (!reduced && !window.gsap && !gsapFailed) return;
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
    if (!hero) return;
    if (reduced) { current = stillMount(hero); return; }
    if (window.gsap) current = mount(hero);
  });
})();
