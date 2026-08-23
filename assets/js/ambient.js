/**
 * Background music: a playlist that runs one piece into the next.
 *
 * Four decisions are baked in, and they are the difference between music that
 * suits a gallery and music that makes people leave:
 *
 * 1. It never starts on its own. Every browser blocks audio that autoplays
 *    with sound, so code that tries is code that fails silently — and on the
 *    occasions it succeeds it is worse, because nobody asked for it. The
 *    control appears quiet and the visitor decides.
 *
 * 2. Once they have decided, it remembers, across pages and across the whole
 *    visit. On a site of separate pages that is the only way it sounds like
 *    one continuous piece of music rather than a track restarting in every
 *    room.
 *
 * 3. Pieces overlap rather than stop and start. Two players take turns: while
 *    one is in its last few seconds the other has already begun, and the pair
 *    are ramped past each other. There is never a silence between tracks and
 *    never an abrupt cut.
 *
 * 4. Turning it off is one obvious click away on every page.
 */

const PREF_KEY = "alafi_sound";
const STATE_KEY = "alafi_sound_state";
const TITLE_MS = 6000;

const store = {
  /**
   * Whether music should be playing.
   *
   * With autoplay on, the default is yes and the visitor's job is to turn it
   * off; with it off, the default is no. Either way an explicit choice always
   * wins and is remembered, so nobody is asked twice.
   */
  wanted(defaultOn) {
    try {
      const saved = localStorage.getItem(PREF_KEY);
      if (saved === "on") return true;
      if (saved === "off") return false;
      return !!defaultOn;
    } catch {
      return !!defaultOn;
    }
  },
  setWanted(on) {
    try { localStorage.setItem(PREF_KEY, on ? "on" : "off"); } catch { /* private mode */ }
  },
  /** Which track, and how far in — so the next page picks up mid-phrase. */
  progress() {
    try { return JSON.parse(sessionStorage.getItem(STATE_KEY)) || {}; } catch { return {}; }
  },
  setProgress(url, at) {
    try { sessionStorage.setItem(STATE_KEY, JSON.stringify({ url, at })); } catch { /* private mode */ }
  }
};

const SPEAKER = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M4 9.5v5h3.2L12 18V6L7.2 9.5H4z" fill="currentColor"/>
  <path class="wave wave-1" d="M15.2 9.2a4 4 0 0 1 0 5.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <path class="wave wave-2" d="M17.8 6.6a7.6 7.6 0 0 1 0 10.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <path class="cross" d="M15.5 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */

const players = [];          // two <audio> elements taking turns
let active = 0;              // which one is currently the foreground
let playlist = [];           // [{ url, title }]
let order = [];              // indices into playlist, possibly shuffled
let cursor = 0;              // position in `order`
let settings = { volume: 30, crossfade: 6, shuffle: true };
let button = null;
let titleTimer = null;
let ticker = null;
let signature = "";
let starting = false;

const clamp01 = (n) => Math.min(1, Math.max(0, n));
const targetVolume = () => clamp01((Number(settings.volume) || 30) / 100);

/* ------------------------------------------------------------------ */
/*  The control                                                        */
/*                                                                     */
/*  The title is not a permanent label. It arrives when a piece starts, */
/*  sits for a few seconds, and collapses away again — long enough to   */
/*  answer "what is this?" and short enough not to become furniture.    */
/* ------------------------------------------------------------------ */

function paint(playing) {
  if (!button) return;
  button.classList.toggle("is-playing", playing);
  button.setAttribute("aria-pressed", String(playing));
  button.setAttribute("aria-label", playing ? "Turn the music off" : "Play background music");
  if (!playing) {
    clearTimeout(titleTimer);
    button.classList.remove("is-naming");
    setLabel("Music");
  }
}

function setLabel(text) {
  const label = button?.querySelector(".ambient-label");
  if (label) label.textContent = text;
}

function announce(title) {
  if (!button) return;
  clearTimeout(titleTimer);

  const name = (title || "").trim();
  if (!name) {
    button.classList.remove("is-naming");
    setLabel("");
    return;
  }

  setLabel(name);
  button.classList.add("is-naming");
  // Announced politely rather than as an alert: it is a nicety, not news.
  button.setAttribute("title", name);
  titleTimer = setTimeout(() => button.classList.remove("is-naming"), TITLE_MS);
}

function markUnavailable() {
  if (!button) return;
  button.disabled = true;
  button.classList.remove("is-playing", "is-naming");
  button.classList.add("is-unavailable");
  button.setAttribute("aria-label", "The background music could not be loaded");
  setLabel("Unavailable");
}

/* ------------------------------------------------------------------ */
/*  Playback                                                           */
/* ------------------------------------------------------------------ */

function makePlayer() {
  const el = new Audio();
  el.preload = "none";
  el.volume = 0;
  el.crossOrigin = "anonymous";

  el.addEventListener("error", () => {
    // One bad file should not take the whole playlist down: step past it.
    if (playlist.length > 1) advance();
    else markUnavailable();
  });

  // The safety net. The handover normally happens before a track finishes, so
  // the two overlap; if it is ever missed — a stall, a seek, a tab that was
  // asleep — reaching the end must still start the next one rather than
  // leaving silence. Something always follows.
  el.addEventListener("ended", () => {
    if (el !== players[active] || el.loop) return;
    advance();
  });

  return el;
}

function ensurePlayers() {
  while (players.length < 2) players.push(makePlayer());
}

/** Fisher-Yates, so a visitor is unlikely to hear the same opening twice. */
function buildOrder() {
  const indices = playlist.map((_, i) => i);
  if (!settings.shuffle) return indices;
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

function trackAt(position) {
  return playlist[order[position % order.length]];
}

/**
 * Ramps a player's volume over `ms`, resolving when it lands. Two of these
 * running in opposite directions is the crossfade.
 */
function ramp(player, to, ms) {
  clearInterval(player._ramp);
  if (ms <= 0) { player.volume = clamp01(to); return; }

  const from = player.volume;
  const started = performance.now();

  player._ramp = setInterval(() => {
    const p = Math.min(1, (performance.now() - started) / ms);
    player.volume = clamp01(from + (to - from) * p);
    if (p >= 1) clearInterval(player._ramp);
  }, 50);
}

/**
 * How long the two tracks actually overlap.
 *
 * Capped at a third of the incoming piece: the setting is a preference, not a
 * promise, and a six second fade into a ten second track would spend most of
 * it fading. Without the cap a short piece hands over the moment it starts and
 * the playlist races.
 */
function fadeSeconds(duration) {
  const wanted = Math.max(0, Number(settings.crossfade) || 0);
  if (!duration || Number.isNaN(duration)) return wanted;
  return Math.min(wanted, duration / 3);
}

/** Resolves once the element knows how long it is, or gives up trying. */
function whenReady(player) {
  if (player.readyState >= 1) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      player.removeEventListener("loadedmetadata", done);
      player.removeEventListener("error", done);
      resolve();
    };
    player.addEventListener("loadedmetadata", done, { once: true });
    player.addEventListener("error", done, { once: true });
    setTimeout(done, 4000);
  });
}

/**
 * Every switch gets a token. The watcher uses it to arm exactly one handover
 * per piece of music: an earlier version reset a boolean on a timer instead,
 * which on short tracks let the same handover fire again and again until the
 * playlist jammed on whatever was playing when the timers collided.
 */
let session = 0;
let armedFor = -1;

async function crossfadeTo(position, { instant = false } = {}) {
  const next = trackAt(position);
  if (!next) return false;

  const outgoing = players[active];
  const incoming = players[1 - active];

  clearInterval(incoming._ramp);
  incoming.preload = "auto";
  incoming.loop = false;
  if (incoming.getAttribute("src") !== next.url) incoming.src = next.url;
  incoming.volume = instant ? targetVolume() : 0;

  await whenReady(incoming);
  // Seeking before the browser has the metadata throws; it is also pointless,
  // since a freshly assigned source already starts at zero.
  try { if (incoming.currentTime > 0.05) incoming.currentTime = 0; } catch { /* not seekable */ }

  try {
    await incoming.play();
  } catch {
    return false;
  }

  const fadeMs = instant ? 0 : fadeSeconds(incoming.duration) * 1000;

  if (fadeMs > 0) {
    ramp(incoming, targetVolume(), fadeMs);
    ramp(outgoing, 0, fadeMs);
    const leaving = outgoing;
    setTimeout(() => { if (leaving !== players[active]) leaving.pause(); }, fadeMs + 150);
  } else {
    incoming.volume = targetVolume();
    if (outgoing !== incoming) { outgoing.pause(); outgoing.volume = 0; }
  }

  active = 1 - active;
  cursor = position;
  session++;
  armedFor = -1;
  announce(next.title);
  paint(true);
  return true;
}

function advance() {
  return crossfadeTo(cursor + 1, { instant: true });
}

/**
 * Watches the foreground player and hands over before it ends. Waiting for
 * `ended` would be too late — by then there has already been a silence.
 */
function startTicker() {
  clearInterval(ticker);
  ticker = setInterval(() => {
    const player = players[active];
    if (!player || player.paused || !player.duration || Number.isNaN(player.duration)) return;

    store.setProgress(player.src, player.currentTime);

    // A lone track loops on itself rather than crossfading with a copy.
    if (order.length < 2) {
      player.loop = true;
      return;
    }

    player.loop = false;
    const remaining = player.duration - player.currentTime;
    if (remaining > fadeSeconds(player.duration) + 0.25) return;
    if (armedFor === session) return;

    armedFor = session;
    const at = session;
    crossfadeTo(cursor + 1)
      .then((ok) => { if (!ok && armedFor === at) armedFor = -1; })
      .catch(() => { if (armedFor === at) armedFor = -1; });
  }, 200);
}

async function begin() {
  if (starting || !playlist.length) return false;
  starting = true;
  try {
    ensurePlayers();
    if (!order.length) order = buildOrder();

    // Resume where the last page left off, if that track is still in the list.
    const saved = store.progress();
    let position = cursor;
    if (saved.url) {
      const index = playlist.findIndex(t => saved.url.endsWith(t.url) || t.url === saved.url);
      const inOrder = order.indexOf(index);
      if (inOrder >= 0) position = inOrder;
    }

    const ok = await crossfadeTo(position, { instant: true });
    if (ok) {
      const player = players[active];
      if (saved.url && player.src.endsWith(saved.url.split("/").pop())) {
        try { player.currentTime = Number(saved.at) || 0; } catch { /* not seekable yet */ }
      }
      startTicker();
    } else {
      paint(false);
    }
    return ok;
  } finally {
    starting = false;
  }
}

function stop() {
  clearInterval(ticker);
  players.forEach((p) => {
    clearInterval(p._ramp);
    if (!p.paused) store.setProgress(p.src, p.currentTime);
    p.pause();
  });
  paint(false);
}

/* ------------------------------------------------------------------ */
/*  Mounting                                                           */
/* ------------------------------------------------------------------ */

function buildButton() {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "ambient";
  el.dataset.persist = "";
  el.innerHTML = `${SPEAKER}<span class="ambient-label">Music</span>`;

  el.addEventListener("click", async () => {
    const playing = players[active] && !players[active].paused;
    if (playing) {
      store.setWanted(false);
      stop();
    } else {
      store.setWanted(true);
      await begin();
    }
  });

  document.body.appendChild(el);
  return el;
}

function normaliseTracks(sound) {
  return (Array.isArray(sound.tracks) ? sound.tracks : [])
    .filter(t => t && typeof t.url === "string" && t.url.trim())
    .slice(0, 20)
    .map(t => ({ url: t.url.trim(), title: (t.title || "").trim() }));
}

/**
 * Called on every config paint. Mounts on the first one that has music,
 * follows later changes, and takes itself off the page if switched off.
 */
export function renderAmbient(config) {
  const sound = config.sound || {};
  const tracks = normaliseTracks(sound);
  const wanted = sound.enabled === true && tracks.length > 0;

  if (!wanted) {
    stop();
    button?.remove();
    button = null;
    playlist = [];
    order = [];
    signature = "";
    document.body.classList.remove("has-ambient");
    return;
  }

  settings = {
    volume: Number(sound.volume) || 30,
    crossfade: Number(sound.crossfade) || 0,
    shuffle: sound.shuffle !== false,
    autoplay: sound.autoplay === true
  };

  document.body.classList.add("has-ambient");
  // The control belongs to the visit, not to the page: the router keeps
  // anything marked persistent when it swaps the body underneath it, which is
  // how the music survives a link click.
  if (!button || !button.isConnected) {
    button?.remove();
    button = buildButton();
    paint(players[active] ? !players[active].paused : false);
  }

  const nextSignature = tracks.map(t => t.url).join("|");
  if (nextSignature !== signature) {
    const wasPlaying = players[active] && !players[active].paused;
    signature = nextSignature;
    playlist = tracks;
    order = buildOrder();
    cursor = 0;
    button.disabled = false;
    button.classList.remove("is-unavailable");
    if (wasPlaying) { stop(); begin(); } else { paint(false); }
  } else if (players[active] && !players[active].paused) {
    // Volume changes apply straight away, so the slider can be judged by ear.
    ramp(players[active], targetVolume(), 300);
  }

  if (store.wanted(settings.autoplay) && (!players[active] || players[active].paused)) {
    begin().then((ok) => { if (!ok) armFirstGesture(); });
  }
}

/**
 * Autoplay, as far as a browser will allow it.
 *
 * No browser will start audible sound before the visitor has interacted with
 * the page — that is not a setting anyone can turn off, it is the rule. So
 * when the attempt is refused we wait for the very first tap, click or key
 * press and start then. In practice that is the first thing they do, and
 * because the site no longer reloads between pages it only has to happen once
 * for the whole visit.
 */
let gestureArmed = false;

function armFirstGesture() {
  if (gestureArmed) return;
  gestureArmed = true;

  const go = async () => {
    if (!store.wanted(settings.autoplay)) { disarm(); return; }
    const ok = await begin();
    if (ok) disarm();
  };

  const disarm = () => {
    gestureArmed = false;
    ["pointerdown", "keydown", "touchstart"].forEach(type =>
      window.removeEventListener(type, go, true));
  };

  ["pointerdown", "keydown", "touchstart"].forEach(type =>
    window.addEventListener(type, go, { capture: true, passive: true }));
}

window.addEventListener("pagehide", () => {
  const player = players[active];
  if (player && !player.paused) store.setProgress(player.src, player.currentTime);
});
