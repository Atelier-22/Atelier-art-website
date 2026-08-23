/**
 * Background music.
 *
 * Three decisions are baked in, and they are the whole difference between
 * music that suits a gallery and music that makes people leave:
 *
 * 1. It never starts on its own. Every browser blocks audio that autoplays
 *    with sound, so code that tries is code that fails silently — and on the
 *    occasions it succeeds it is worse, because nobody asked for it. The
 *    control appears quiet and the visitor decides.
 *
 * 2. Once they have decided, it remembers. Turning it on and having to turn
 *    it on again on the next page would be its own kind of rude. The choice is
 *    kept in localStorage and playback resumes from where it left off, which
 *    on a site of separate pages is the only way it sounds continuous.
 *
 * 3. Turning it off is always one obvious click away, on every page.
 */

const PREF_KEY = "alafi_sound";
const POSITION_KEY = "alafi_sound_at";

const store = {
  wanted() {
    try { return localStorage.getItem(PREF_KEY) === "on"; } catch { return false; }
  },
  setWanted(on) {
    try { localStorage.setItem(PREF_KEY, on ? "on" : "off"); } catch { /* private mode */ }
  },
  position() {
    try { return Number(sessionStorage.getItem(POSITION_KEY)) || 0; } catch { return 0; }
  },
  setPosition(seconds) {
    try { sessionStorage.setItem(POSITION_KEY, String(seconds)); } catch { /* private mode */ }
  }
};

let audio = null;
let button = null;
let track = "";
let lastSaved = 0;

const SPEAKER = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M4 9.5v5h3.2L12 18V6L7.2 9.5H4z" fill="currentColor"/>
  <path class="wave wave-1" d="M15.2 9.2a4 4 0 0 1 0 5.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <path class="wave wave-2" d="M17.8 6.6a7.6 7.6 0 0 1 0 10.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <path class="cross" d="M15.5 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;

function paint(playing) {
  if (!button) return;
  button.classList.toggle("is-playing", playing);
  button.setAttribute("aria-pressed", String(playing));
  button.setAttribute("aria-label", playing ? "Turn the music off" : "Play background music");
  const label = button.querySelector(".ambient-label");
  if (label) label.textContent = playing ? (audio?.dataset.title || "Playing") : "Music";
}

function remember() {
  if (!audio || audio.paused) return;
  // Once a second is enough to make a reload feel continuous, and avoids a
  // storage write on every timeupdate tick.
  const now = Math.floor(audio.currentTime);
  if (now === lastSaved) return;
  lastSaved = now;
  store.setPosition(audio.currentTime);
}

function buildAudio(config) {
  const el = new Audio();
  el.src = config.sound.trackUrl;
  el.loop = true;
  el.preload = "none";
  el.volume = Math.min(1, Math.max(0, (Number(config.sound.volume) || 40) / 100));
  el.dataset.title = (config.sound.title || "").trim();

  el.addEventListener("timeupdate", remember);
  el.addEventListener("pause", () => { remember(); paint(false); });
  el.addEventListener("play", () => paint(true));
  el.addEventListener("error", () => {
    // A track that will not load should say so rather than leaving a control
    // that silently does nothing. Removing the button outright was worse: a
    // single failed request took away any way of trying again.
    if (!button) return;
    button.disabled = true;
    button.classList.remove("is-playing");
    button.classList.add("is-unavailable");
    button.setAttribute("aria-label", "The background music could not be loaded");
    const label = button.querySelector(".ambient-label");
    if (label) label.textContent = "Unavailable";
  });

  return el;
}

async function start() {
  if (!audio) return false;
  try {
    audio.currentTime = store.position();
  } catch { /* not seekable yet; it will start from zero */ }

  try {
    await audio.play();
    return true;
  } catch {
    // Blocked, which is the browser's default until the visitor interacts.
    paint(false);
    return false;
  }
}

function buildButton() {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "ambient";
  el.innerHTML = `${SPEAKER}<span class="ambient-label">Music</span>`;

  el.addEventListener("click", async () => {
    if (!audio) return;
    if (audio.paused) {
      store.setWanted(true);
      await start();
    } else {
      store.setWanted(false);
      audio.pause();
    }
  });

  document.body.appendChild(el);
  return el;
}

/**
 * Called on every config paint. Mounts on the first one that has a track,
 * follows later changes, and tears itself down if the owner switches it off.
 */
export function renderAmbient(config) {
  const sound = config.sound || {};
  const wanted = sound.enabled === true && !!(sound.trackUrl || "").trim();

  if (!wanted) {
    audio?.pause();
    audio = null;
    button?.remove();
    button = null;
    track = "";
    document.body.classList.remove("has-ambient");
    return;
  }

  document.body.classList.add("has-ambient");
  if (!button) button = buildButton();

  if (sound.trackUrl !== track) {
    const wasPlaying = audio && !audio.paused;
    audio?.pause();
    track = sound.trackUrl;
    audio = buildAudio(config);
    // A new track deserves a fresh attempt even if the last one failed.
    button.disabled = false;
    button.classList.remove("is-unavailable");
    paint(false);
    if (wasPlaying) start();
  } else if (audio) {
    audio.volume = Math.min(1, Math.max(0, (Number(sound.volume) || 40) / 100));
    audio.dataset.title = (sound.title || "").trim();
  }

  // Resume for a visitor who already said yes. If the browser refuses, the
  // control simply sits there showing "Music" until they press it.
  if (store.wanted() && audio.paused) start();
}

window.addEventListener("pagehide", remember);
