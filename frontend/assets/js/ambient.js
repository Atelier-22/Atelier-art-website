const PREF_KEY = "alafi_sound";
const STATE_KEY = "alafi_sound_state";
const TITLE_MS = 6000;

const store = {
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
    try { localStorage.setItem(PREF_KEY, on ? "on" : "off"); } catch { }
  },
  progress() {
    try { return JSON.parse(sessionStorage.getItem(STATE_KEY)) || {}; } catch { return {}; }
  },
  setProgress(url, at) {
    try { sessionStorage.setItem(STATE_KEY, JSON.stringify({ url, at })); } catch { }
  }
};

const SPEAKER = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M4 9.5v5h3.2L12 18V6L7.2 9.5H4z" fill="currentColor"/>
  <path class="wave wave-1" d="M15.2 9.2a4 4 0 0 1 0 5.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <path class="wave wave-2" d="M17.8 6.6a7.6 7.6 0 0 1 0 10.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <path class="cross" d="M15.5 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;


const players = [];
let active = 0;
let playlist = [];
let order = [];
let cursor = 0;
let settings = { volume: 30, crossfade: 6, shuffle: true };
let button = null;
let titleTimer = null;
let ticker = null;
let signature = "";
let starting = false;

const clamp01 = (n) => Math.min(1, Math.max(0, n));
const targetVolume = () => clamp01((Number(settings.volume) || 30) / 100);


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


function makePlayer() {
  const el = new Audio();
  el.preload = "none";
  el.volume = 0;
  el.crossOrigin = "anonymous";

  el.addEventListener("error", () => {
    if (playlist.length > 1) advance();
    else markUnavailable();
  });

  el.addEventListener("ended", () => {
    if (el !== players[active] || el.loop) return;
    advance();
  });

  return el;
}

function ensurePlayers() {
  while (players.length < 2) players.push(makePlayer());
}

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

function fadeSeconds(duration) {
  const wanted = Math.max(0, Number(settings.crossfade) || 0);
  if (!duration || Number.isNaN(duration)) return wanted;
  return Math.min(wanted, duration / 3);
}

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
  try { if (incoming.currentTime > 0.05) incoming.currentTime = 0; } catch { }

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

function startTicker() {
  clearInterval(ticker);
  ticker = setInterval(() => {
    const player = players[active];
    if (!player || player.paused || !player.duration || Number.isNaN(player.duration)) return;

    store.setProgress(player.src, player.currentTime);

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
        try { player.currentTime = Number(saved.at) || 0; } catch { }
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
    ramp(players[active], targetVolume(), 300);
  }

  if (store.wanted(settings.autoplay) && (!players[active] || players[active].paused)) {
    begin().then((ok) => { if (!ok) armFirstGesture(); });
  }
}

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
