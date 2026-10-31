import {
  DISPLAY_FONTS, BODY_FONTS, watchConfig, saveConfig, contrastReport, hasBlockingContrastFailure,
  derivePalette, mergeConfig, parseEmbed, updateState, timeLeft, UPDATE_DURATIONS, sanitiseHtml
} from "./site-config.js?v=20261031a";
import {
  uploadAndRecord, watchMedia, inspectVideo, videoRejectionReason,
  videoTrimNotice, resourceTypeFor, isAudio, MAX_VIDEO_BYTES,
  MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS, releaseAsset, setCategoryCover
} from "./data.js?v=20261031a";
import { posterFromVideo, VIDEO_TRIM_SECONDS } from "./cloudinary.js?v=20261031a";
import { readTrackName, titleFromFilename } from "./id3.js?v=20261031a";
import { $, $$, escapeHtml, toast, modal } from "./admin-ui.js?v=20261031a";

const CONFIG_OWNER = "siteConfig/published";

const state = {
  config: null,
  tab: "theme",
  view: "overview",
  dirty: false,
  saving: false,
  saveError: "",
  savedAt: 0,
  saveTimer: null,
  queue: Promise.resolve(),
  readyPromise: null,
  mounted: false,
  categories: [],
  media: [],
  onChange: null
};


const fontOptions = (dict) =>
  Object.entries(dict).map(([value, font]) => ({ value, label: font.label }));

const TABS = [
  {
    id: "theme",
    label: "Theme",
    note: "Eight colours drive the whole palette. Everything else — hairlines, wells, dimmed text, shadows, the wash over the wallpaper — is worked out from these, so they can never fall out of step with each other.",
    groups: [
      {
        title: "Colours",
        fields: [
          { type: "color", path: "theme.bg", label: "Page background", note: "The ground the whole site sits on." },
          { type: "color", path: "theme.bgRaised", label: "Cards and panels", note: "Anything lifted off the page." },
          { type: "color", path: "theme.fg", label: "Text", note: "Secondary and faint text are mixed from this and the background." },
          { type: "color", path: "theme.gold", label: "Accent", note: "Links, eyebrows, small print that needs to catch the eye." },
          { type: "color", path: "theme.goldFill", label: "Accent fill", note: "Solid buttons. Kept separate because a colour dark enough to read as text is too dark to put text on." },
          { type: "color", path: "theme.danger", label: "Warnings" },
          { type: "color", path: "theme.ok", label: "Confirmations" }
        ]
      },
      { title: "Readability", fields: [{ type: "contrast" }] },
      { title: "Preview", fields: [{ type: "swatches" }] },
      {
        title: "Type",
        fields: [
          { type: "select", path: "theme.displayFont", label: "Headings", options: fontOptions(DISPLAY_FONTS) },
          { type: "select", path: "theme.bodyFont", label: "Body text", options: fontOptions(BODY_FONTS) },
          { type: "typepreview" }
        ]
      },
      {
        title: "Layout",
        note: "The two measurements the page is built on.",
        fields: [
          { type: "number", path: "theme.measure", label: "Maximum content width", min: 900, max: 2200, step: 20, suffix: "px", note: "How wide the site is allowed to get on a large screen." },
          { type: "number", path: "theme.gutter", label: "Side margin", min: 20, max: 160, step: 4, suffix: "px", note: "Space between the content and the edge of the window. Phones always use a smaller value." }
        ]
      },
      {
        title: "Image delivery",
        note: "Applies to everything hosted on Cloudinary, across the whole site. It does not touch the images that ship with the site until you move a collection across.",
        fields: [
          {
            type: "toggle", path: "delivery.autoQuality",
            label: "Serve images at automatic quality",
            note: "Sends each picture in the best format the visitor's browser accepts, at a quality chosen per image, capped to 1800px wide. Nothing is cropped and the originals are untouched — this only changes how they are delivered. It typically cuts a 578 KB photograph to nearer 100 KB, which is the difference between roughly 900 and roughly 5,000 collection-page views a month. Preview it before publishing."
          }
        ]
      }
    ]
  },

  {
    id: "branding",
    label: "Branding",
    groups: [
      {
        title: "Name and mark",
        fields: [
          { type: "image", path: "branding.logoUrl", label: "Logo", note: "Shown in the header and the footer. Leave empty for no logo." },
          { type: "text", path: "branding.wordmark", label: "Wordmark", placeholder: "Alafi" },
          { type: "text", path: "branding.wordmarkDot", label: "Accent character", note: "The bit after the name, shown in the accent colour." },
          { type: "text", path: "branding.siteTitle", label: "Site name", note: "Used in the footer and the browser tab." }
        ]
      },
      {
        title: "Footer",
        fields: [
          { type: "textarea", path: "branding.footerBlurb", label: "Footer description", rows: 2 },
          { type: "text", path: "branding.copyright", label: "Copyright line" },
          { type: "text", path: "branding.rights", label: "Rights line" }
        ]
      }
    ]
  },

  {
    id: "home",
    label: "Homepage",
    groups: [
      {
        title: "Hero",
        note: "The full-screen opening. The headline is three lines so it can stagger in; wrap a word in <em> to italicise it.",
        fields: [
          { type: "images", path: "home.heroImages", label: "Hero slideshow", note: "Cross-fades through these. Two or more to animate." },
          { type: "text", path: "home.heroEyebrow", label: "Eyebrow" },
          { type: "html", path: "home.heroLine1", label: "Headline, line 1" },
          { type: "html", path: "home.heroLine2", label: "Headline, line 2" },
          { type: "html", path: "home.heroLine3", label: "Headline, line 3" },
          {
            type: "list", path: "home.heroStory", label: "Animated story lines", addLabel: "Add a line",
            note: "The opening animation cycles through these before settling on the headline.",
            defaultItem: { text: "" },
            itemFields: [{ key: "text", label: "Line", type: "text" }]
          },
          { type: "text", path: "home.heroCtaLabel", label: "Gallery button", note: "Leave empty for no button." },
          { type: "textarea", path: "home.heroBlurb", label: "Introduction", rows: 3 },
          {
            type: "list", path: "home.heroStats", label: "Figures", addLabel: "Add a figure",
            defaultItem: { value: "", label: "" },
            itemFields: [
              { key: "value", label: "Figure", type: "text" },
              { key: "label", label: "Caption", type: "text" }
            ]
          }
        ]
      },
      {
        title: "Curator's note",
        fields: [
          { type: "html", path: "home.manifesto", label: "Quotation", note: "Wrap a word in <b> to pick it out in the accent colour." },
          { type: "text", path: "home.manifestoAttrib", label: "Attribution" }
        ]
      },
      {
        title: "Artist block",
        fields: [
          { type: "image", path: "home.artistPortrait", label: "Portrait" },
          { type: "text", path: "home.artistEyebrow", label: "Eyebrow" },
          { type: "text", path: "home.artistName", label: "Name" },
          { type: "textarea", path: "home.artistCopy", label: "Introduction", rows: 5, note: "Leave a blank line between paragraphs." },
          { type: "text", path: "home.artistCtaLabel", label: "About-page link", note: "Leave empty for no link." }
        ]
      },
      {
        title: "Closing block",
        fields: [
          { type: "text", path: "home.finaleEyebrow", label: "Eyebrow" },
          { type: "text", path: "home.finaleTitle", label: "Heading" },
          { type: "textarea", path: "home.finaleBlurb", label: "Text", rows: 2 },
          { type: "text", path: "home.finaleCtaLabel", label: "Gallery button", note: "Leave empty for no button. The scrolling band above it lists your collections." }
        ]
      }
    ]
  },

  {
    id: "update",
    label: "Update",
    note: "A short note pinned to the top of the homepage — an exhibition opening, a new series, a studio note. It takes itself down when its time is up, so the site is never showing last month's news. This is not the same thing as the Story tab, which is your long-form writing and stays until you change it.",
    groups: [
      {
        title: "The update",
        fields: [
          { type: "toggle", path: "update.enabled", label: "Show an update on the homepage" },
          { type: "textarea", path: "update.text", label: "What's happening", rows: 4, note: "Keep it to a line or two — it is set large, at the top of the page." },
          {
            type: "media", label: "Picture or video",
            urlPath: "update.mediaUrl", typePath: "update.mediaType",
            posterPath: "update.mediaPoster", durationPath: "update.mediaDuration",
            emptyNote: "Optional — the update reads fine as words alone."
          }
        ]
      },
      {
        title: "How long it stays up",
        fields: [
          {
            type: "select", path: "update.durationHours", label: "Take it down after",
            numeric: true,
            options: UPDATE_DURATIONS.map(d => ({ value: String(d.hours), label: d.label })),
            note: "Counted from when you post it. Leave it at 24 hours unless this one should last longer."
          },
          { type: "post" }
        ]
      },
      {
        title: "Link",
        fields: [
          { type: "text", path: "update.linkLabel", label: "Link text", note: "Leave empty for no link." },
          { type: "text", path: "update.linkHref", label: "Link target", placeholder: "gallery.html" }
        ]
      }
    ]
  },

  {
    id: "story",
    label: "Story",
    note: "Your long-form writing — the story, the bio, an artist statement. It sits further down the homepage and stays until you change it. For a short note that should expire on its own, use the Update tab.",
    groups: [
      {
        title: "The section",
        fields: [
          { type: "toggle", path: "story.enabled", label: "Show this section on the homepage" },
          {
            type: "select", path: "story.position", label: "Where it sits",
            options: [
              { value: "top", label: "Top — the first thing visitors see" },
              { value: "artist", label: "Lower down, under the Alafi block" }
            ],
            note: "At the top it comes before the opening image, so a new story is the first thing anyone meets rather than something they have to scroll to find."
          },
          { type: "text", path: "story.eyebrow", label: "Eyebrow" },
          { type: "text", path: "story.heading", label: "Heading" },
          { type: "textarea", path: "story.body", label: "The story", rows: 12, note: "Leave a blank line between paragraphs." }
        ]
      },
      {
        title: "Accompanying media",
        note: "Optional. Sits beside the text on a wide screen and above it on a phone. A picture, a video, or a YouTube or Vimeo link. Videos are compressed on the way out and trimmed to the first two minutes if they run longer — the full file you upload is kept either way.",
        fields: [
          {
            type: "media", label: "Media",
            urlPath: "story.mediaUrl",
            typePath: "story.mediaType",
            posterPath: "story.mediaPoster",
            durationPath: "story.mediaDuration",
            emptyNote: "The story runs full width when there is no media."
          }
        ]
      },
      {
        title: "Link",
        fields: [
          { type: "text", path: "story.ctaLabel", label: "Link text", note: "Leave empty for no link." },
          { type: "text", path: "story.ctaHref", label: "Link target", placeholder: "about.html" }
        ]
      }
    ]
  },

  {
    id: "about",
    label: "About page",
    note: "The whole About page. Sections can be added, reordered, and removed — the page is whatever this list says it is.",
    groups: [
      {
        title: "Header",
        fields: [
          { type: "text", path: "about.title", label: "Page title" },
          { type: "text", path: "about.tagline", label: "Tagline" },
          { type: "textarea", path: "about.blurb", label: "Introduction", rows: 3 },
          { type: "image", path: "about.portrait", label: "Portrait" },
          { type: "textarea", path: "about.quote", label: "Pull quote", rows: 2 }
        ]
      },
      { title: "Sections", fields: [{ type: "blocks", path: "about.blocks" }] }
    ]
  },

  {
    id: "gallery",
    label: "Gallery",
    note: "The collections index page. Each card shows its collection's own cover — the same cover you set under Collections. Changing it here or there changes the one picture.",
    groups: [
      {
        title: "The pictures inside each collection",
        note: "Deleting, replacing and reordering the artwork itself happens in Artworks, where you can open a collection and work through it.",
        fields: [{ type: "link", label: "Open a collection", view: "artworks", focus: "#collection-panel", cta: "Go to Artworks" }]
      },
      {
        title: "Header",
        fields: [
          { type: "text", path: "gallery.title", label: "Page title" },
          { type: "text", path: "gallery.tagline", label: "Tagline" },
          { type: "textarea", path: "gallery.blurb", label: "Introduction", rows: 3 }
        ]
      },
      {
        title: "Collection covers",
        note: "Stored on each collection. Empty means the card shows no picture.",
        fields: [{ type: "covers", path: "gallery.covers" }]
      }
    ]
  },

  {
    id: "sound",
    label: "Sound",
    note: "A piece of music that a visitor can choose to have playing while they look around. It never starts on its own — browsers block audio nobody asked for, and a gallery that makes noise at you is one people close.",
    groups: [
      {
        title: "Background music",
        fields: [
          { type: "toggle", path: "sound.enabled", label: "Offer music on the site", note: "Puts a small control in the corner of every page. Visitors decide whether to use it, and their choice is remembered as they move around." },
          { type: "tracks", path: "sound.tracks", label: "Playlist" }
        ]
      },
      {
        title: "How it plays",
        fields: [
          {
            type: "toggle", path: "sound.autoplay", label: "Start playing on its own",
            note: "Visitors arrive with the music already on and turn it off if they would rather not — rather than arriving in silence and having to find the button. No browser will make sound before someone has touched the page, so where that applies it starts at their first tap or click instead. Because the site no longer reloads between pages, that happens once for the whole visit."
          },
          { type: "number", path: "sound.volume", label: "Volume", min: 5, max: 100, step: 5, suffix: "%", note: "Background music should sit under the room, not in front of it. Around 30 is right for most tracks — press play on one above to judge it by ear." },
          { type: "number", path: "sound.crossfade", label: "Overlap between tracks", min: 0, max: 12, step: 1, suffix: "s", note: "One piece begins underneath the last and they pass through each other, so there is never a gap or an abrupt cut. Zero switches straight over." },
          { type: "toggle", path: "sound.shuffle", label: "Play in a random order", note: "On, so two visitors are unlikely to hear the same opening — and neither will the same person coming back." }
        ]
      }
    ]
  },

  {
    id: "backgrounds",
    label: "Backgrounds",
    note: "The photograph behind each kind of page, heavily veiled so text stays readable.",
    groups: [
      {
        title: "Page wallpapers",
        fields: [
          { type: "image", path: "backgrounds.home", label: "Homepage" },
          { type: "image", path: "backgrounds.gallery", label: "Gallery index" },
          { type: "image", path: "backgrounds.category", label: "Collection pages" },
          { type: "image", path: "backgrounds.comics", label: "Comics" },
          { type: "image", path: "backgrounds.about", label: "About" },
          { type: "image", path: "backgrounds.contact", label: "Contact" },
          { type: "image", path: "backgrounds.notFound", label: "Page not found (404)" }
        ]
      }
    ]
  },

  {
    id: "comics",
    label: "Comics page",
    groups: [
      {
        title: "Reading Room header",
        fields: [
          { type: "text", path: "comics.title", label: "Page title" },
          { type: "text", path: "comics.tagline", label: "Tagline" },
          { type: "textarea", path: "comics.blurb", label: "Introduction", rows: 3 }
        ]
      }
    ]
  },

  {
    id: "contact",
    label: "Contact page",
    groups: [
      {
        title: "Header",
        fields: [
          { type: "text", path: "contact.title", label: "Page title" },
          { type: "text", path: "contact.tagline", label: "Tagline" },
          { type: "textarea", path: "contact.blurb", label: "Introduction", rows: 3 }
        ]
      },
      {
        title: "Ways to reach you",
        note: "Emails and phone numbers link themselves. For Instagram or any other site, put the full address in Link.",
        fields: [
          { type: "text", path: "contact.eyebrow", label: "Eyebrow" },
          { type: "text", path: "contact.heading", label: "Heading" },
          {
            type: "list", path: "contact.items", label: "Contact details", addLabel: "Add a contact",
            defaultItem: { label: "", value: "", href: "" },
            itemFields: [
              { key: "label", label: "Label", type: "text" },
              { key: "value", label: "Shown as", type: "text" },
              { key: "href", label: "Link (optional)", type: "text" }
            ]
          }
        ]
      },
      {
        title: "Topics",
        fields: [
          { type: "text", path: "contact.topicsEyebrow", label: "Eyebrow" },
          { type: "text", path: "contact.topicsHeading", label: "Heading" },
          {
            type: "list", path: "contact.topics", label: "Topics", addLabel: "Add a topic",
            defaultItem: { title: "" },
            itemFields: [{ key: "title", label: "Topic", type: "text" }]
          }
        ]
      },
      { title: "More sections", fields: [{ type: "blocks", path: "contact.blocks" }] }
    ]
  },

  {
    id: "seo",
    label: "Sharing",
    note: "What search engines and link previews read. WhatsApp, Facebook and X only pick up a change on their next crawl.",
    groups: [
      {
        title: "Search and link previews",
        fields: [
          { type: "textarea", path: "seo.description", label: "Site description", rows: 3 },
          { type: "image", path: "seo.shareImage", label: "Share image", note: "Shown when someone shares a link to the site. Empty means no image." }
        ]
      }
    ]
  },

  {
    id: "legal",
    label: "Legal pages",
    groups: [
      {
        title: "Privacy policy",
        fields: [
          { type: "text", path: "legal.privacyTitle", label: "Browser tab title" },
          { type: "htmlarea", path: "legal.privacyHtml", label: "Page content (HTML)", rows: 18 }
        ]
      },
      {
        title: "Terms of service",
        fields: [
          { type: "text", path: "legal.termsTitle", label: "Browser tab title" },
          { type: "htmlarea", path: "legal.termsHtml", label: "Page content (HTML)", rows: 18 }
        ]
      },
      {
        title: "Page not found (404)",
        fields: [
          { type: "text", path: "notFound.title", label: "Heading" },
          { type: "text", path: "notFound.tagline", label: "Tagline" },
          { type: "textarea", path: "notFound.blurb", label: "Text", rows: 3 }
        ]
      }
    ]
  }
];


function get(obj, path) {
  return path.split(".").reduce((node, key) => (node == null ? undefined : node[key]), obj);
}

function set(obj, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((node, key) => {
    if (!node[key] || typeof node[key] !== "object") node[key] = {};
    return node[key];
  }, obj);
  target[last] = value;
}


const seconds = (n) => `${Math.round(n)}s`;
const minutes = (n) => `${Math.floor(n / 60)}:${String(Math.round(n % 60)).padStart(2, "0")}`;
const megabytes = (n) => `${(n / 1048576).toFixed(1)} MB`;

function bandwidthNote(bytes) {
  const perThousand = (bytes * 1000) / 1073741824;
  return `${megabytes(bytes)} per play — about ${perThousand.toFixed(1)} GB per 1,000 plays, against a 25 GB monthly allowance shared with the rest of the site.`;
}

export function pickMedia(current = "", { allow = ["image"] } = {}) {
  const wantsVideo = allow.includes("video");
  const wantsEmbed = allow.includes("embed");
  const wantsAudio = allow.includes("audio");
  const audioOnly = wantsAudio && !wantsVideo && !allow.includes("image");

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value, close) => {
      if (settled) return;
      settled = true;
      resolve(value);
      close();
    };

    const accept = audioOnly ? "audio/*" : wantsVideo ? "image/*,video/*" : "image/*";

    const dropHint = audioOnly
      ? `An mp3 or m4a, up to ${MAX_AUDIO_BYTES / 1048576} MB and ${MAX_AUDIO_SECONDS / 60} minutes`
      : wantsVideo
        ? `Images, or video up to ${MAX_VIDEO_BYTES / 1048576} MB — anything past ${VIDEO_TRIM_SECONDS / 60} minutes is trimmed for you`
        : "Uploaded to Cloudinary and added to your library";

    modal({
      title: audioOnly ? "Choose a track" : wantsVideo ? "Choose an image or video" : "Choose an image",
      wide: true,
      hideConfirm: true,
      body: `
        <div class="picker">
          <div class="picker-tabs">
            <button type="button" class="is-active" data-ptab="upload">Upload</button>
            <button type="button" data-ptab="library">Library</button>
            ${wantsEmbed ? '<button type="button" data-ptab="embed">YouTube / Vimeo</button>' : ""}
            <button type="button" data-ptab="url">Address</button>
          </div>

          <div class="picker-pane is-active" data-pane="upload">
            <div class="dropzone" data-pick-drop>
              <strong>Drop a file here, or click to choose</strong>
              <span>${dropHint}</span>
              <input type="file" accept="${accept}" data-pick-input>
            </div>
            <div class="progress" data-pick-progress hidden><span></span></div>
            <p class="status-line" data-pick-status></p>
          </div>

          <div class="picker-pane" data-pane="library">
            <div class="picker-grid" data-pick-library><p class="empty-note">Loading…</p></div>
          </div>

          ${wantsEmbed ? `
            <div class="picker-pane" data-pane="embed">
              <div class="field">
                <label>YouTube or Vimeo link</label>
                <input type="text" data-pick-embed placeholder="https://www.youtube.com/watch?v=…">
              </div>
              <p class="form-note">
                For anything longer than ${VIDEO_TRIM_SECONDS / 60} minutes that should play in full. Costs nothing to serve and has no length
                limit, but the player carries its provider&rsquo;s branding. YouTube is embedded
                through its no-cookie player.
              </p>
              <button class="btn is-primary" type="button" data-pick-embed-go>Use this video</button>
              <p class="status-line" data-pick-embed-status></p>
            </div>` : ""}

          <div class="picker-pane" data-pane="url">
            <div class="field">
              <label>Address</label>
              <input type="text" data-pick-url value="${escapeHtml(current)}" placeholder="https://…">
            </div>
            <button class="btn is-primary" type="button" data-pick-url-go>Use this address</button>
          </div>
        </div>
      `,
      onMount(overlay, close) {
        const tabs = $$("[data-ptab]", overlay);
        const panes = $$("[data-pane]", overlay);
        tabs.forEach(tab => tab.addEventListener("click", () => {
          tabs.forEach(t => t.classList.toggle("is-active", t === tab));
          panes.forEach(p => p.classList.toggle("is-active", p.dataset.pane === tab.dataset.ptab));
        }));

        const input = $("[data-pick-input]", overlay);
        const drop = $("[data-pick-drop]", overlay);
        const bar = $("[data-pick-progress]", overlay);
        const status = $("[data-pick-status]", overlay);

        const upload = async (file) => {
          if (!file) return;
          const audioFile = isAudio(file);
          const timeBased = resourceTypeFor(file) === "video";

          if (audioFile && !wantsAudio) {
            status.textContent = "This field does not take audio. Background music is set under Sound.";
            return;
          }
          if (timeBased && !audioFile && !wantsVideo) {
            status.textContent = "This field takes an image. Video can be used in the Story section.";
            return;
          }
          if (!timeBased && wantsAudio && !wantsVideo) {
            status.textContent = "This field takes an audio file — an mp3 or m4a.";
            return;
          }

          let measured = null;
          let songName = "";

          if (timeBased) {
            try {
              measured = await inspectVideo(file);
              const reason = videoRejectionReason(measured, audioFile ? "audio" : "video");
              if (reason) { status.textContent = reason; return; }

              if (audioFile) {
                songName = await readTrackName(file);
                status.textContent = `${songName} · ${minutes(measured.duration)} — ${bandwidthNote(measured.bytes)}`;
              } else {
                const trim = videoTrimNotice(measured.duration);
                status.textContent = trim
                  ? `${measured.width}×${measured.height} · ${trim}`
                  : `${seconds(measured.duration)}, ${measured.width}×${measured.height} — ${bandwidthNote(measured.bytes)}`;
              }
            } catch (err) {
              status.textContent = err.message;
              return;
            }
          }

          bar.hidden = false;
          const label = status.textContent;
          try {
            const asset = await uploadAndRecord(file, {
              usedFor: audioFile ? "music" : timeBased ? "story-video" : "site",
              onProgress: (p) => {
                bar.firstElementChild.style.width = `${p * 100}%`;
                status.textContent = `Uploading ${file.name}… ${Math.round(p * 100)}%`;
              }
            });
            finish({
              url: asset.url,
              type: audioFile ? "audio" : asset.resourceType === "video" ? "video" : "image",
              poster: !audioFile && asset.resourceType === "video" ? posterFromVideo(asset.url) : "",
              bytes: asset.bytes,
              duration: asset.duration ?? measured?.duration ?? null,
              title: songName || titleFromFilename(asset.filename || file.name)
            }, close);
          } catch (err) {
            console.error(err);
            status.textContent = err.message || "That upload failed.";
            bar.hidden = true;
            setTimeout(() => { if (!settled) status.textContent = label; }, 6000);
          }
        };

        drop.addEventListener("click", () => input.click());
        input.addEventListener("change", () => upload(input.files[0]));
        ["dragenter", "dragover"].forEach(ev =>
          drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("is-dragging"); }));
        ["dragleave", "drop"].forEach(ev =>
          drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("is-dragging"); }));
        drop.addEventListener("drop", e => upload(e.dataTransfer.files[0]));

        const kindOf = (m) => (m.usedFor === "music" ? "audio" : m.type === "video" ? "video" : "image");
        const libraryHost = $("[data-pick-library]", overlay);
        const usable = state.media.filter((m) => {
          const kind = kindOf(m);
          if (kind === "audio") return wantsAudio;
          if (kind === "video") return wantsVideo;
          return !audioOnly;
        });

        libraryHost.innerHTML = usable.length
          ? usable.map((m) => {
              const kind = kindOf(m);
              const thumb = kind === "video" ? posterFromVideo(m.url) : kind === "image" ? m.url : "";
              return `
                <button type="button" class="picker-item${m.url === current ? " is-current" : ""}"
                        data-url="${escapeHtml(m.url)}" data-type="${kind}">
                  ${thumb
                    ? `<img src="${escapeHtml(thumb)}" alt="" loading="lazy">`
                    : '<span class="picker-audio">&#9834;</span>'}
                  ${kind === "image" ? "" : `<span class="picker-badge">${kind === "audio" ? "Track" : "Video"}</span>`}
                  <span>${escapeHtml(m.filename || m.publicId || "")}</span>
                </button>`;
            }).join("")
          : `<p class="empty-note">Nothing ${audioOnly ? "here yet" : "uploaded yet"}. Use the Upload tab.</p>`;

        overlay.addEventListener("click", (e) => {
          const item = e.target.closest(".picker-item");
          if (!item) return;
          const type = item.dataset.type || "image";
          finish({
            url: item.dataset.url,
            type,
            poster: type === "video" ? posterFromVideo(item.dataset.url) : ""
          }, close);
        });

        if (wantsEmbed) {
          const embedInput = $("[data-pick-embed]", overlay);
          const embedStatus = $("[data-pick-embed-status]", overlay);
          $("[data-pick-embed-go]", overlay).addEventListener("click", () => {
            const parsed = parseEmbed(embedInput.value);
            if (!parsed) {
              embedStatus.textContent = "That does not look like a YouTube or Vimeo link.";
              return;
            }
            finish({ url: embedInput.value.trim(), type: "embed", poster: "" }, close);
          });
        }

        $("[data-pick-url-go]", overlay).addEventListener("click", () => {
          const value = $("[data-pick-url]", overlay).value.trim();
          if (!value) return;
          finish({ url: value, type: "image", poster: "" }, close);
        });

        $("[data-cancel]", overlay).addEventListener("click", () => {
          if (!settled) { settled = true; resolve(null); }
        });
      }
    });
  });
}

export async function pickImage(current = "") {
  const choice = await pickMedia(current, { allow: ["image"] });
  return choice === null ? null : choice.url;
}


function markDirty() {
  state.dirty = true;
  state.saveError = "";
  renderStatus();
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    flushSave().catch(err => console.error("Autosave failed:", err));
  }, 550);
}

export function flushSave() {
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  const run = state.queue.then(async () => {
    if (!state.config) return;
    if (hasBlockingContrastFailure(state.config.theme)) {
      state.saveError = "Not saved — fix the readability warnings in Theme first.";
      renderStatus();
      throw new Error(state.saveError);
    }
    const snapshot = mergeConfig(JSON.parse(JSON.stringify(state.config)));
    state.saving = true;
    renderStatus();
    try {
      await saveConfig(snapshot);
      state.dirty = JSON.stringify(mergeConfig(state.config)) !== JSON.stringify(snapshot);
      state.saveError = "";
      state.savedAt = Date.now();
      state.onChange?.(snapshot);
    } catch (err) {
      console.error("Saving the site settings failed:", err);
      state.saveError = `Not saved: ${err.message || err.code || "unknown error"}`;
      toast(state.saveError, "error");
      throw err;
    } finally {
      state.saving = false;
      renderStatus();
    }
  });
  state.queue = run.catch(() => undefined);
  return run;
}

async function replaceAsset(oldUrl, write) {
  write();
  await flushSave();
  if (!oldUrl) return null;
  try {
    const released = await releaseAsset(oldUrl, { ownerPath: CONFIG_OWNER, expectedInOwner: 0 });
    return released;
  } catch (err) {
    console.error("The new file is live, but the old one could not be removed from Cloudinary:", err);
    toast(`Saved. The old file is still in Cloudinary: ${err.message}`, "error");
    return null;
  }
}

async function clearAsset(oldUrl, write) {
  if (oldUrl) {
    try {
      await releaseAsset(oldUrl, { ownerPath: CONFIG_OWNER, expectedInOwner: 1 });
    } catch (err) {
      console.error("Cloudinary delete failed, so the field was kept:", err);
      toast(`Not removed — Cloudinary refused: ${err.message}`, "error");
      throw err;
    }
  }
  write();
  await flushSave();
}

function fieldShell(label, note, control, extraClass = "") {
  return `
    <div class="setting ${extraClass}">
      ${label ? `<label class="setting-label">${escapeHtml(label)}</label>` : ""}
      <div class="setting-control">${control}</div>
      ${note ? `<p class="setting-note">${escapeHtml(note)}</p>` : ""}
    </div>`;
}

const FULL_WIDTH_FIELDS = new Set([
  "images", "list", "blocks", "covers", "contrast", "swatches", "typepreview",
  "media", "link", "tracks", "post", "htmlarea"
]);

function renderField(field) {
  const value = field.path ? get(state.config, field.path) : undefined;
  const el = document.createElement("div");
  el.className = `setting-wrap${FULL_WIDTH_FIELDS.has(field.type) ? " is-full" : ""}`;

  switch (field.type) {
    case "color": {
      el.innerHTML = fieldShell(field.label, field.note, `
        <div class="color-row">
          <input type="color" data-setting value="${escapeHtml(value || "#000000")}">
          <input type="text" data-setting-hex value="${escapeHtml(value || "")}" spellcheck="false">
        </div>`);
      const picker = $("[data-setting]", el);
      const hex = $("[data-setting-hex]", el);
      const apply = (next) => {
        set(state.config, field.path, next);
        picker.value = next;
        hex.value = next;
        markDirty();
        renderLiveTheme();
      };
      picker.addEventListener("input", () => apply(picker.value));
      hex.addEventListener("change", () => {
        const next = hex.value.trim();
        if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(next)) apply(next);
        else hex.value = get(state.config, field.path) || "";
      });
      break;
    }

    case "text":
    case "html": {
      el.innerHTML = fieldShell(field.label, field.note,
        `<input type="text" data-setting value="${escapeHtml(value ?? "")}"
                placeholder="${escapeHtml(field.placeholder || "")}">`);
      const input = $("[data-setting]", el);
      input.addEventListener("input", () => {
        set(state.config, field.path, sanitise(input.value, field.type === "html"));
        markDirty();
      });
      break;
    }

    case "textarea":
    case "htmlarea": {
      el.innerHTML = fieldShell(field.label, field.note,
        `<textarea data-setting rows="${field.rows || 4}"${field.type === "htmlarea" ? ' spellcheck="false" class="is-code"' : ""}>${escapeHtml(value ?? "")}</textarea>`);
      const input = $("[data-setting]", el);
      input.addEventListener("input", () => {
        set(state.config, field.path, field.type === "htmlarea" ? sanitiseHtml(input.value) : input.value);
        markDirty();
      });
      break;
    }

    case "select": {
      el.innerHTML = fieldShell(field.label, field.note, `
        <select data-setting>
          ${field.options.map(o => `
            <option value="${escapeHtml(o.value)}"${o.value === String(value) ? " selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}
        </select>`);
      const input = $("[data-setting]", el);
      input.addEventListener("change", () => {
        set(state.config, field.path, field.numeric ? Number(input.value) : input.value);
        markDirty();
        if (field.numeric) $$("[data-state]").forEach(node => node.closest(".setting")?._repaint?.());
        renderLiveTheme();
      });
      break;
    }

    case "number": {
      el.innerHTML = fieldShell(field.label, field.note, `
        <div class="number-row">
          <input type="range" data-setting min="${field.min}" max="${field.max}" step="${field.step || 1}" value="${Number(value) || field.min}">
          <output data-setting-out>${Number(value) || field.min}${field.suffix || ""}</output>
        </div>`);
      const input = $("[data-setting]", el);
      const out = $("[data-setting-out]", el);
      input.addEventListener("input", () => {
        set(state.config, field.path, Number(input.value));
        out.textContent = `${input.value}${field.suffix || ""}`;
        markDirty();
        renderLiveTheme();
        if (field.path === "sound.volume") {
          const level = Math.min(1, Math.max(0, Number(input.value) / 100));
          $$(".track-list audio").forEach((a) => { a.volume = level; });
        }
      });
      break;
    }

    case "toggle": {
      el.innerHTML = `
        <div class="setting is-toggle">
          <label class="switch">
            <input type="checkbox" data-setting ${value === false ? "" : "checked"}>
            <span></span>
            ${escapeHtml(field.label)}
          </label>
          ${field.note ? `<p class="setting-note">${escapeHtml(field.note)}</p>` : ""}
        </div>`;
      const input = $("[data-setting]", el);
      input.addEventListener("change", () => {
        set(state.config, field.path, input.checked);
        markDirty();
      });
      break;
    }

    case "image":
      el.appendChild(imageField(field.label, field.note, value, {
        onReplace: (next, previous) => replaceAsset(previous, () => set(state.config, field.path, next)),
        onClear: (previous) => clearAsset(previous, () => set(state.config, field.path, ""))
      }));
      break;

    case "media":
      el.appendChild(mediaField(field));
      break;

    case "tracks":
      el.appendChild(tracksField(field));
      break;

    case "post":
      el.appendChild(postField());
      break;

    case "images":
      el.appendChild(imageListField(field));
      break;

    case "list":
      el.appendChild(listField(field));
      break;

    case "blocks":
      el.appendChild(blocksField(field));
      break;

    case "covers":
      el.appendChild(coversField(field));
      break;

    case "link":
      el.innerHTML = `
        <button type="button" class="btn is-primary" data-goto-view="${escapeHtml(field.view)}"
                ${field.focus ? `data-goto-focus="${escapeHtml(field.focus)}"` : ""}>
          ${escapeHtml(field.cta || field.label)} &#8594;
        </button>`;
      break;

    case "contrast":
      el.innerHTML = '<div class="contrast-report" data-contrast></div>';
      break;

    case "swatches":
      el.innerHTML = '<div class="swatch-strip" data-swatches></div>';
      break;

    case "typepreview":
      el.innerHTML = `
        <div class="type-preview" data-typepreview>
          <h4>Every piece is a room you walk into.</h4>
          <p>Seven collections by Alafi Jonathan — paint, graphite, pixel, and stone.</p>
        </div>`;
      break;

    default:
      el.textContent = `Unknown field type: ${field.type}`;
  }

  return el;
}

function sanitise(value, allowMarkup) {
  if (!allowMarkup) return value;
  return value
    .replace(/<\s*\/?\s*(script|style|iframe|object|embed|link|meta)\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

function imageField(label, note, value, { onReplace, onClear }) {
  const el = document.createElement("div");
  el.className = "setting";
  el.innerHTML = `
    ${label ? `<label class="setting-label">${escapeHtml(label)}</label>` : ""}
    <div class="setting-control">
      <div class="image-field">
        <div class="image-thumb" data-thumb></div>
        <div class="image-actions">
          <button class="btn is-small" type="button" data-choose></button>
          <button class="btn is-small is-danger" type="button" data-clear>Remove</button>
          <code class="image-path" data-path></code>
          <p class="setting-note" data-field-status role="status" aria-live="polite" style="flex-basis:100%"></p>
        </div>
      </div>
    </div>
    ${note ? `<p class="setting-note">${escapeHtml(note)}</p>` : ""}`;

  const statusEl = $("[data-field-status]", el);
  const paint = (next) => {
    $("[data-thumb]", el).innerHTML = next
      ? `<img src="${escapeHtml(next)}" alt="">`
      : '<span class="image-empty">None</span>';
    $("[data-choose]", el).textContent = next ? "Replace" : "Choose";
    $("[data-clear]", el).hidden = !next;
    $("[data-path]", el).textContent = next || "";
  };
  const busy = (on, text = "") => {
    $$("button", el).forEach(b => { b.disabled = on; });
    statusEl.textContent = text;
  };
  paint(value);

  $("[data-choose]", el).addEventListener("click", async () => {
    const next = await pickImage(value);
    if (next === null || next === value) return;
    const previous = value;
    busy(true, "Saving…");
    try {
      const released = await onReplace(next, previous);
      value = next;
      paint(next);
      busy(false, released?.destroyed ? "Saved. The old file was deleted from Cloudinary." : "Saved.");
    } catch (err) {
      console.error(err);
      busy(false, `Not saved: ${err.message}`);
    }
  });

  $("[data-clear]", el).addEventListener("click", async () => {
    const previous = value;
    busy(true, "Removing…");
    try {
      await onClear(previous);
      value = "";
      paint("");
      busy(false, "Removed.");
    } catch (err) {
      console.error(err);
      busy(false, `Not removed: ${err.message}`);
    }
  });

  return el;
}

function mediaField(field) {
  const el = document.createElement("div");
  el.className = "setting is-full";
  el.innerHTML = `
    <label class="setting-label">${escapeHtml(field.label)}</label>
    <div class="setting-control">
      <div class="image-field">
        <div class="image-thumb is-media" data-thumb></div>
        <div class="image-actions">
          <button class="btn is-small" type="button" data-choose>Choose</button>
          <button class="btn is-small is-danger" type="button" data-clear>Remove</button>
          <code class="image-path" data-path></code>
          <p class="setting-note" data-media-note style="flex-basis:100%"></p>
        </div>
      </div>
    </div>`;

  const paint = () => {
    const url = get(state.config, field.urlPath) || "";
    const type = get(state.config, field.typePath) || "";
    const poster = get(state.config, field.posterPath) || "";

    const thumb = $("[data-thumb]", el);
    const note = $("[data-media-note]", el);

    if (!url) {
      thumb.innerHTML = '<span class="image-empty">None</span>';
      note.textContent = field.emptyNote || "It runs full width when there is no media.";
    } else if (type === "embed") {
      const parsed = parseEmbed(url);
      thumb.innerHTML = `<span class="image-empty">${escapeHtml(parsed?.provider || "Link")}</span>`;
      note.textContent = parsed
        ? `Embedded from ${parsed.provider}. Costs nothing to serve, and carries their player.`
        : "This link is not a YouTube or Vimeo address, so nothing will be shown.";
    } else if (type === "video") {
      const duration = Number(field.durationPath ? get(state.config, field.durationPath) : 0) || 0;
      const trimmed = duration > VIDEO_TRIM_SECONDS;
      thumb.innerHTML = `<img src="${escapeHtml(poster || posterFromVideo(url))}" alt="">`;
      note.textContent = trimmed
        ? `Compressed and trimmed to the first ${VIDEO_TRIM_SECONDS / 60} minutes of ${minutes(duration)}. Your full upload is untouched, so this can be changed later.`
        : "Compressed on the way out at the highest quality setting, and only loaded when a visitor presses play.";
    } else {
      thumb.innerHTML = `<img src="${escapeHtml(url)}" alt="">`;
      note.textContent = "";
    }

    $("[data-choose]", el).textContent = url ? "Replace" : "Choose";
    $("[data-clear]", el).hidden = !url;
    $("[data-path]", el).textContent = url;
  };

  const write = (url, type, poster, duration = null) => {
    set(state.config, field.urlPath, url);
    set(state.config, field.typePath, type);
    set(state.config, field.posterPath, poster);
    set(state.config, field.durationPath, duration);
  };
  const statusEl = $("[data-media-note]", el);

  $("[data-choose]", el).addEventListener("click", async () => {
    const previous = get(state.config, field.urlPath) || "";
    const choice = await pickMedia(previous, { allow: ["image", "video", "embed"] });
    if (choice === null || !choice.url) return;
    try {
      const released = await replaceAsset(previous, () => write(choice.url, choice.type, choice.poster || "", choice.duration ?? null));
      paint();
      if (released?.destroyed) statusEl.textContent += " The previous file was deleted from Cloudinary.";
    } catch (err) {
      console.error(err);
      paint();
      statusEl.textContent = `Not saved: ${err.message}`;
    }
  });

  $("[data-clear]", el).addEventListener("click", async () => {
    try {
      await clearAsset(get(state.config, field.urlPath) || "", () => write("", "", "", null));
      paint();
    } catch (err) {
      console.error(err);
      statusEl.textContent = `Not removed: ${err.message}`;
    }
  });

  paint();
  return el;
}

export const MAX_TRACKS = 20;

function tracksField(field) {
  const el = document.createElement("div");
  el.className = "setting is-full";
  el.innerHTML = `
    <label class="setting-label">${escapeHtml(field.label)}</label>
    <div class="setting-control"><div class="track-list" data-list></div></div>`;

  const host = $("[data-list]", el);
  const read = () => (get(state.config, field.path) || []).slice();
  const write = (tracks) => { set(state.config, field.path, tracks); markDirty(); };
  const commitTracks = (tracks) => { set(state.config, field.path, tracks); };

  const paint = () => {
    const tracks = read();
    const volume = Math.min(1, Math.max(0, (Number(get(state.config, "sound.volume")) || 30) / 100));

    host.innerHTML = tracks.map((track, i) => `
      <div class="track-row">
        <span class="track-index">${String(i + 1).padStart(2, "0")}</span>
        <div class="track-main">
          <input type="text" data-i="${i}" data-key="title"
                 value="${escapeHtml(track.title || "")}" placeholder="Untitled — shown briefly when it starts">
          <audio controls preload="none" src="${escapeHtml(track.url)}"></audio>
        </div>
        <div class="repeat-actions">
          <button type="button" data-up="${i}" ${i === 0 ? "disabled" : ""} aria-label="Move earlier">&#9650;</button>
          <button type="button" data-down="${i}" ${i === tracks.length - 1 ? "disabled" : ""} aria-label="Move later">&#9660;</button>
          <button type="button" data-swap="${i}" aria-label="Replace this track">&#8635;</button>
          <button type="button" data-remove="${i}" class="is-danger" aria-label="Remove">&times;</button>
        </div>
      </div>`).join("") + `
      <div class="track-foot">
        <button type="button" class="btn is-small is-primary" data-add ${tracks.length >= MAX_TRACKS ? "disabled" : ""}>
          Add a track
        </button>
        <span class="setting-note" style="margin:0">
          ${tracks.length} of ${MAX_TRACKS}${tracks.length >= MAX_TRACKS ? " — that's the limit" : ""}.
          ${tracks.length > 1 ? "They play one into the next." : tracks.length === 1 ? "One track repeats; add more for variety." : "Nothing yet — the control stays off the site until there is at least one."}
        </span>
      </div>`;

    host.querySelectorAll("audio").forEach((a) => { a.volume = volume; });
  };

  host.addEventListener("input", (e) => {
    const input = e.target.closest("input[data-key]");
    if (!input) return;
    const tracks = read();
    tracks[Number(input.dataset.i)] = { ...tracks[Number(input.dataset.i)], title: input.value };
    write(tracks);
  });

  host.addEventListener("click", async (e) => {
    const button = e.target.closest("button");
    if (!button) return;
    const tracks = read();

    try {
      if (button.dataset.add !== undefined) {
        if (tracks.length >= MAX_TRACKS) return;
        const choice = await pickMedia("", { allow: ["audio"] });
        if (!choice?.url) return;
        tracks.push({ url: choice.url, title: choice.title || titleFromFilename(choice.url.split("/").pop()) });
        commitTracks(tracks);
        await flushSave();
        paint();
        return;
      }
      if (button.dataset.swap !== undefined) {
        const i = Number(button.dataset.swap);
        const previous = tracks[i].url;
        const choice = await pickMedia(previous, { allow: ["audio"] });
        if (!choice?.url) return;
        tracks[i] = { url: choice.url, title: choice.title || tracks[i].title || titleFromFilename(choice.url.split("/").pop()) };
        await replaceAsset(previous, () => commitTracks(tracks));
        paint();
        return;
      }
      if (button.dataset.remove !== undefined) {
        const i = Number(button.dataset.remove);
        const previous = tracks[i].url;
        tracks.splice(i, 1);
        await clearAsset(previous, () => commitTracks(tracks));
        paint();
        return;
      }
    } catch (err) {
      console.error(err);
      toast(err.message, "error");
      paint();
      return;
    }

    if (button.dataset.up !== undefined) {
      const i = Number(button.dataset.up);
      [tracks[i - 1], tracks[i]] = [tracks[i], tracks[i - 1]];
    } else if (button.dataset.down !== undefined) {
      const i = Number(button.dataset.down);
      [tracks[i + 1], tracks[i]] = [tracks[i], tracks[i + 1]];
    } else {
      return;
    }

    write(tracks);
    paint();
  });

  paint();
  el._repaint = paint;
  return el;
}

function postField() {
  const el = document.createElement("div");
  el.className = "setting is-full";
  el.innerHTML = `
    <div class="post-row">
      <div class="post-state" data-state></div>
      <div class="post-actions">
        <button class="btn is-primary" type="button" data-post></button>
        <button class="btn is-danger" type="button" data-takedown hidden>Take it down</button>
      </div>
    </div>`;

  const paint = () => {
    const update = state.config.update || {};
    const info = updateState(update);
    const stateEl = $("[data-state]", el);
    const postBtn = $("[data-post]", el);

    const posted = info.postedAt ? new Date(info.postedAt) : null;
    const when = posted ? posted.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";

    if (!(update.text || "").trim()) {
      stateEl.className = "post-state";
      stateEl.textContent = "Write something above first.";
      postBtn.disabled = true;
      postBtn.textContent = "Post it";
    } else if (info.live) {
      stateEl.className = "post-state is-live";
      stateEl.textContent = info.reason === "indefinite"
        ? `Live since ${when} — no time limit, so it stays until you take it down.`
        : `Live since ${when} — ${timeLeft(info.remainingMs)}. It comes down by itself.`;
      postBtn.disabled = false;
      postBtn.textContent = "Post again (restarts the clock)";
    } else if (info.reason === "expired") {
      stateEl.className = "post-state is-expired";
      stateEl.textContent = `Expired. It was posted ${when} and is no longer on the site.`;
      postBtn.disabled = false;
      postBtn.textContent = "Post it again";
    } else if (info.reason === "off") {
      stateEl.className = "post-state";
      stateEl.textContent = "Switched off, so nothing is showing.";
      postBtn.disabled = false;
      postBtn.textContent = "Post it";
    } else {
      stateEl.className = "post-state";
      stateEl.textContent = "Not posted yet.";
      postBtn.disabled = false;
      postBtn.textContent = "Post it";
    }

    $("[data-takedown]", el).hidden = !info.live;
  };

  $("[data-post]", el).addEventListener("click", () => {
    const hours = Number(state.config.update?.durationHours) || 0;
    const label = UPDATE_DURATIONS.find(d => d.hours === hours)?.label || `${hours} hours`;

    modal({
      title: "Post this update?",
      body: `It goes to the top of the homepage now, and
             ${hours ? `comes down by itself after <b>${escapeHtml(label)}</b>` : "<b>stays until you take it down</b>"}.`,
      confirmLabel: "Post it",
      onConfirm: async () => {
        set(state.config, "update.enabled", true);
        set(state.config, "update.postedAt", new Date().toISOString());
        await flushSave();
        renderBody();
        toast("Posted — it's at the top of the homepage.", "ok");
      }
    });
  });

  $("[data-takedown]", el).addEventListener("click", () => {
    modal({
      title: "Take the update down?",
      body: "It comes off the homepage straight away. The words stay here, so you can post it again later.",
      confirmLabel: "Take it down",
      danger: true,
      onConfirm: async () => {
        set(state.config, "update.enabled", false);
        await flushSave();
        renderBody();
        toast("Taken down.", "ok");
      }
    });
  });

  paint();
  el._repaint = paint;
  return el;
}

function imageListField(field) {
  const el = document.createElement("div");
  el.className = "setting is-full";
  el.innerHTML = `
    <label class="setting-label">${escapeHtml(field.label)}</label>
    <div class="setting-control"><div class="image-list" data-list></div></div>
    ${field.note ? `<p class="setting-note">${escapeHtml(field.note)}</p>` : ""}`;

  const host = $("[data-list]", el);

  const paint = () => {
    const items = get(state.config, field.path) || [];
    host.innerHTML = items.map((src, i) => `
      <div class="image-list-item">
        <img src="${escapeHtml(src)}" alt="">
        <div class="image-list-actions">
          <button type="button" data-up="${i}" ${i === 0 ? "disabled" : ""} aria-label="Move earlier">&#9668;</button>
          <button type="button" data-down="${i}" ${i === items.length - 1 ? "disabled" : ""} aria-label="Move later">&#9658;</button>
          <button type="button" data-remove="${i}" class="is-danger" aria-label="Remove">&times;</button>
        </div>
      </div>`).join("") + '<button type="button" class="image-list-add" data-add>+ Add</button>';
  };

  host.addEventListener("click", async (e) => {
    const items = (get(state.config, field.path) || []).slice();
    const button = e.target.closest("button");
    if (!button) return;

    if (button.dataset.add !== undefined) {
      const next = await pickImage("");
      if (!next) return;
      items.push(next);
      set(state.config, field.path, items);
      try { await flushSave(); }
      catch (err) { console.error(err); }
      paint();
      return;
    }
    if (button.dataset.remove !== undefined) {
      const i = Number(button.dataset.remove);
      const previous = items[i];
      items.splice(i, 1);
      button.disabled = true;
      try { await clearAsset(previous, () => set(state.config, field.path, items)); }
      catch (err) { console.error(err); button.disabled = false; return; }
      paint();
      return;
    }
    if (button.dataset.up !== undefined) {
      const i = Number(button.dataset.up);
      [items[i - 1], items[i]] = [items[i], items[i - 1]];
    } else if (button.dataset.down !== undefined) {
      const i = Number(button.dataset.down);
      [items[i + 1], items[i]] = [items[i], items[i + 1]];
    } else {
      return;
    }

    set(state.config, field.path, items);
    paint();
    markDirty();
  });

  paint();
  return el;
}

function listField(field) {
  const el = document.createElement("div");
  el.className = "setting is-full";
  el.innerHTML = `
    <label class="setting-label">${escapeHtml(field.label)}</label>
    <div class="setting-control"><div class="repeat-list" data-list></div></div>
    ${field.note ? `<p class="setting-note">${escapeHtml(field.note)}</p>` : ""}`;

  const host = $("[data-list]", el);

  const paint = () => {
    const items = get(state.config, field.path) || [];
    host.innerHTML = items.map((item, i) => `
      <div class="repeat-row">
        <div class="repeat-fields">
          ${field.itemFields.map(f => `
            <div class="field">
              <label>${escapeHtml(f.label)}</label>
              <input type="text" data-i="${i}" data-key="${escapeHtml(f.key)}" value="${escapeHtml(item[f.key] ?? "")}">
            </div>`).join("")}
        </div>
        <div class="repeat-actions">
          <button type="button" data-up="${i}" ${i === 0 ? "disabled" : ""}>&#9650;</button>
          <button type="button" data-down="${i}" ${i === items.length - 1 ? "disabled" : ""}>&#9660;</button>
          <button type="button" data-remove="${i}" class="is-danger">&times;</button>
        </div>
      </div>`).join("") +
      `<button type="button" class="btn is-small" data-add>${escapeHtml(field.addLabel || "Add")}</button>`;
  };

  host.addEventListener("input", (e) => {
    const input = e.target.closest("input[data-key]");
    if (!input) return;
    const items = (get(state.config, field.path) || []).slice();
    items[Number(input.dataset.i)] = { ...items[Number(input.dataset.i)], [input.dataset.key]: input.value };
    set(state.config, field.path, items);
    markDirty();
  });

  host.addEventListener("click", (e) => {
    const button = e.target.closest("button");
    if (!button) return;
    const items = (get(state.config, field.path) || []).slice();

    if (button.dataset.add !== undefined) items.push({ ...(field.defaultItem || {}) });
    else if (button.dataset.up !== undefined) {
      const i = Number(button.dataset.up);
      [items[i - 1], items[i]] = [items[i], items[i - 1]];
    } else if (button.dataset.down !== undefined) {
      const i = Number(button.dataset.down);
      [items[i + 1], items[i]] = [items[i], items[i + 1]];
    } else if (button.dataset.remove !== undefined) items.splice(Number(button.dataset.remove), 1);
    else return;

    set(state.config, field.path, items);
    paint();
    markDirty();
  });

  paint();
  return el;
}


const BLOCK_TYPES = [
  { value: "prose", label: "Written section", itemsLabel: "" },
  { value: "steps", label: "Numbered steps", itemsLabel: "Steps" },
  { value: "timeline", label: "Timeline", itemsLabel: "Milestones" },
  { value: "tags", label: "Word list", itemsLabel: "Words" },
  { value: "figures", label: "Figures", itemsLabel: "Figures" }
];

function blocksField(field) {
  const el = document.createElement("div");
  el.className = "setting is-full";
  el.innerHTML = '<div class="setting-control"><div class="block-list" data-list></div></div>';
  const host = $("[data-list]", el);

  const read = () => (get(state.config, field.path) || []).slice();
  const write = (blocks) => { set(state.config, field.path, blocks); markDirty(); };

  const paint = () => {
    const blocks = read();
    host.innerHTML = blocks.map((block, i) => {
      const type = BLOCK_TYPES.find(t => t.value === block.type) || BLOCK_TYPES[0];
      const items = block.items || [];
      return `
        <div class="block-card">
          <div class="block-head">
            <select data-block="${i}" data-key="type">
              ${BLOCK_TYPES.map(t => `<option value="${t.value}"${t.value === block.type ? " selected" : ""}>${escapeHtml(t.label)}</option>`).join("")}
            </select>
            <span class="block-title">${escapeHtml(block.heading || "Untitled section")}</span>
            <div class="repeat-actions">
              <button type="button" data-bup="${i}" ${i === 0 ? "disabled" : ""}>&#9650;</button>
              <button type="button" data-bdown="${i}" ${i === blocks.length - 1 ? "disabled" : ""}>&#9660;</button>
              <button type="button" data-bremove="${i}" class="is-danger">&times;</button>
            </div>
          </div>

          <div class="field"><label>Eyebrow</label>
            <input type="text" data-block="${i}" data-key="eyebrow" value="${escapeHtml(block.eyebrow || "")}"></div>
          <div class="field"><label>Heading</label>
            <input type="text" data-block="${i}" data-key="heading" value="${escapeHtml(block.heading || "")}"></div>
          <div class="field"><label>${block.type === "prose" ? "Text" : "Introduction"}</label>
            <textarea rows="${block.type === "prose" ? 6 : 2}" data-block="${i}" data-key="body">${escapeHtml(block.body || "")}</textarea></div>

          ${type.itemsLabel ? `
            <div class="field">
              <label>${escapeHtml(type.itemsLabel)}</label>
              <div class="block-items">
                ${items.map((item, j) => `
                  <div class="block-item">
                    <input type="text" data-block="${i}" data-item="${j}" data-key="title"
                           value="${escapeHtml(item.title || "")}" placeholder="${block.type === "figures" ? "Figure" : "Name"}">
                    ${block.type === "tags" ? "" : `
                      <input type="text" data-block="${i}" data-item="${j}" data-key="text"
                             value="${escapeHtml(item.text || "")}" placeholder="Description">`}
                    <button type="button" data-iremove="${i}:${j}" class="is-danger">&times;</button>
                  </div>`).join("")}
                <button type="button" class="btn is-small" data-iadd="${i}">Add</button>
              </div>
            </div>` : ""}
        </div>`;
    }).join("") + '<button type="button" class="btn is-primary is-small" data-badd>Add a section</button>';
  };

  host.addEventListener("input", (e) => {
    const input = e.target.closest("[data-block]");
    if (!input || input.tagName === "SELECT") return;
    const blocks = read();
    const i = Number(input.dataset.block);
    if (input.dataset.item !== undefined) {
      const items = (blocks[i].items || []).slice();
      items[Number(input.dataset.item)] = { ...items[Number(input.dataset.item)], [input.dataset.key]: input.value };
      blocks[i] = { ...blocks[i], items };
    } else {
      blocks[i] = { ...blocks[i], [input.dataset.key]: input.value };
    }
    write(blocks);
  });

  host.addEventListener("change", (e) => {
    const select = e.target.closest("select[data-block]");
    if (!select) return;
    const blocks = read();
    const i = Number(select.dataset.block);
    blocks[i] = { ...blocks[i], type: select.value };
    write(blocks);
    paint();
  });

  host.addEventListener("click", (e) => {
    const button = e.target.closest("button");
    if (!button) return;
    const blocks = read();

    if (button.dataset.badd !== undefined) {
      blocks.push({ type: "prose", eyebrow: "", heading: "New section", body: "", items: [] });
    } else if (button.dataset.bup !== undefined) {
      const i = Number(button.dataset.bup);
      [blocks[i - 1], blocks[i]] = [blocks[i], blocks[i - 1]];
    } else if (button.dataset.bdown !== undefined) {
      const i = Number(button.dataset.bdown);
      [blocks[i + 1], blocks[i]] = [blocks[i], blocks[i + 1]];
    } else if (button.dataset.bremove !== undefined) {
      blocks.splice(Number(button.dataset.bremove), 1);
    } else if (button.dataset.iadd !== undefined) {
      const i = Number(button.dataset.iadd);
      blocks[i] = { ...blocks[i], items: [...(blocks[i].items || []), { title: "", text: "" }] };
    } else if (button.dataset.iremove !== undefined) {
      const [i, j] = button.dataset.iremove.split(":").map(Number);
      const items = (blocks[i].items || []).slice();
      items.splice(j, 1);
      blocks[i] = { ...blocks[i], items };
    } else {
      return;
    }

    write(blocks);
    paint();
  });

  paint();
  return el;
}


function coversField() {
  const el = document.createElement("div");
  el.className = "setting is-full";
  el.innerHTML = '<div class="setting-control"><div class="cover-grid" data-list></div></div>';
  const host = $("[data-list]", el);

  const paint = () => {
    host.innerHTML = "";
    if (!state.categories.length) {
      host.innerHTML = '<p class="empty-note">No collections yet.</p>';
      return;
    }
    state.categories.forEach((category) => {
      host.appendChild(imageField(category.name || category.slug, "", category.cover || "", {
        onReplace: (next) => setCategoryCover(category.id, next).then(r => r.released),
        onClear: () => setCategoryCover(category.id, "")
      }));
    });
  };

  paint();
  el._repaint = paint;
  return el;
}


function renderLiveTheme() {
  const palette = derivePalette(state.config.theme);

  $$("[data-swatches]").forEach((host) => {
    const shown = [
      ["Page", "--bg"], ["Cards", "--bg-raised"], ["Wells", "--bg-sunken"],
      ["Text", "--fg"], ["Secondary", "--fg-dim"], ["Accent", "--gold"],
      ["Accent fill", "--gold-fill"], ["On accent", "--on-gold"]
    ];
    host.innerHTML = shown.map(([label, token]) => `
      <div class="swatch">
        <span style="background:${palette[token]}"></span>
        <small>${label}</small>
      </div>`).join("");
  });

  $$("[data-typepreview]").forEach((host) => {
    host.style.setProperty("--preview-display", palette["--display"]);
    host.style.setProperty("--preview-body", palette["--body"]);
    host.style.background = palette["--bg"];
    host.style.color = palette["--fg"];
  });

  $$("[data-contrast]").forEach((host) => {
    const report = contrastReport(state.config.theme);
    host.innerHTML = report.map(row => `
      <div class="contrast-row is-${row.level}">
        <span class="contrast-chip" style="background:${row.bg};color:${row.fg}">Aa</span>
        <span class="contrast-label">${escapeHtml(row.label)}</span>
        <span class="contrast-ratio">${row.ratio.toFixed(1)}:1</span>
        <span class="contrast-verdict">${row.level === "pass" ? "Readable" : row.level === "warn" ? "Marginal" : "Too low"}</span>
      </div>`).join("") +
      (report.some(r => r.level === "fail")
        ? '<p class="contrast-block">Saving is blocked while anything here is too low to read.</p>'
        : "");
  });

  renderStatus();
}


export function setActiveView(view) {
  state.view = view;
  renderStatus();
}

function renderStatus() {
  const host = $("#settings-status");
  if (!host || !state.config) return;

  host.textContent = state.saveError
    ? state.saveError
    : state.saving || state.dirty
      ? "Saving…"
      : state.savedAt
        ? "Saved — live on the site"
        : "All changes save straight to the live site";
  host.className = `settings-status${state.saveError ? " is-error" : state.saving || state.dirty ? " is-pending" : " is-clean"}`;

  const bar = $("#publish-bar");
  if (bar) {
    const showing = state.view === "settings";
    bar.hidden = !showing;
    document.body.classList.toggle("has-publish-bar", showing);
  }
}


function renderTabs() {
  const host = $("#settings-tabs");
  host.innerHTML = TABS.map(tab => `
    <button type="button" data-tab="${tab.id}"${tab.id === state.tab ? ' class="is-active"' : ""}>${escapeHtml(tab.label)}</button>`).join("");

  host.addEventListener("click", (e) => {
    const button = e.target.closest("[data-tab]");
    if (!button) return;
    state.tab = button.dataset.tab;
    const url = new URL(location.href);
    url.searchParams.set("tab", state.tab);
    history.pushState({ admin: true }, "", url.href);
    $$("[data-tab]", host).forEach(b => b.classList.toggle("is-active", b === button));
    renderBody();
  });
}

function renderBody() {
  const host = $("#settings-body");
  const tab = TABS.find(t => t.id === state.tab) || TABS[0];

  host.innerHTML = tab.note ? `<p class="settings-intro">${escapeHtml(tab.note)}</p>` : "";

  tab.groups.forEach((group, groupIndex) => {
    const panel = document.createElement("div");
    panel.className = "panel settings-group";
    panel.dataset.group = groupIndex;
    panel.innerHTML = `
      <h2>${escapeHtml(group.title)}</h2>
      ${group.note ? `<p class="panel-sub">${escapeHtml(group.note)}</p>` : ""}
      <div class="settings-fields"></div>`;
    const fields = $(".settings-fields", panel);
    group.fields.forEach((field, fieldIndex) => {
      const el = renderField(field);
      el.dataset.fieldIndex = fieldIndex;
      fields.appendChild(el);
    });
    host.appendChild(panel);
  });

  renderLiveTheme();
}

function loadConfig() {
  return new Promise((resolve, reject) => {
    let first = true;
    watchConfig((config) => {
      if (first) {
        first = false;
        state.config = config;
        resolve();
        return;
      }
      if (state.dirty || state.saving) return;
      if (JSON.stringify(config) === JSON.stringify(mergeConfig(state.config))) return;
      state.config = config;
      if (state.mounted && $("#settings-body") && !document.activeElement?.closest?.("#settings-body")) renderBody();
    }, (err) => {
      if (first) reject(err);
      else toast(`Live settings stopped updating: ${err.message}`, "error");
    });
  });
}

export async function initSettings({ onChange } = {}) {
  if (state.mounted) return state.readyPromise;
  state.mounted = true;
  state.onChange = onChange;
  state.readyPromise = (async () => {
    await loadConfig();
    const urlTab = new URLSearchParams(location.search).get("tab");
    if (TABS.some(tab => tab.id === urlTab)) state.tab = urlTab;
    renderTabs();
    renderBody();
    window.addEventListener("popstate", () => {
      const tab = new URLSearchParams(location.search).get("tab");
      if (!TABS.some(item => item.id === tab)) return;
      state.tab = tab;
      $$(`[data-tab]`, $("#settings-tabs")).forEach(button => button.classList.toggle("is-active", button.dataset.tab === tab));
      renderBody();
    });
    watchMedia((items) => { state.media = items; }, (err) => {
      state.media = [];
      toast(`The media library could not be loaded: ${err.message}`, "error");
    });
  })();
  return state.readyPromise;
}

export function hasPendingSave() {
  return state.dirty || state.saving || !!state.saveTimer;
}

export function settingsSnapshot() {
  return state.config ? mergeConfig(state.config) : null;
}

const TAB_KEYWORDS = {
  theme: "appearance look style design make up makeup colour color colours colors palette font fonts typeface type text size width layout dark light quality",
  branding: "logo name brand title wordmark footer copyright identity",
  home: "homepage front page landing hero slideshow headline intro artist portrait quote closing",
  update: "news announcement notice banner post",
  story: "story section narrative",
  about: "about biography bio portrait page",
  gallery: "gallery collections covers index header",
  comics: "comics reading room stories header",
  contact: "contact email phone instagram details",
  seo: "seo share image og twitter description preview",
  legal: "privacy terms legal 404 not found",
  sound: "music audio playlist songs tracks volume",
  backgrounds: "background wallpaper wallpapers images pages"
};

const FIELD_LABELS = {
  contrast: "Readability check",
  swatches: "Colour preview",
  typepreview: "Type preview",
  covers: "Collection covers",
  blocks: "Page sections",
  tracks: "Playlist",
  post: "Post the update"
};

export function settingsSearchIndex() {
  const entries = [];
  TABS.forEach((tab) => {
    entries.push({
      title: tab.label,
      context: "Settings",
      keywords: `${TAB_KEYWORDS[tab.id] || ""} ${tab.note || ""}`,
      tab: tab.id
    });
    tab.groups.forEach((group, groupIndex) => {
      entries.push({
        title: group.title,
        context: `Settings › ${tab.label}`,
        keywords: `${TAB_KEYWORDS[tab.id] || ""} ${group.note || ""}`,
        tab: tab.id,
        group: groupIndex
      });
      group.fields.forEach((field, fieldIndex) => {
        const label = field.label || FIELD_LABELS[field.type];
        if (!label || label === group.title) return;
        entries.push({
          title: label,
          context: `Settings › ${tab.label} › ${group.title}`,
          keywords: `${field.note || ""} ${field.path || ""} ${TAB_KEYWORDS[tab.id] || ""}`,
          tab: tab.id,
          group: groupIndex,
          field: fieldIndex
        });
      });
    });
  });
  return entries;
}

export async function openSetting(tabId, groupIndex, fieldIndex) {
  if (!state.mounted) await initSettings();
  else await state.readyPromise;
  if (!TABS.some(tab => tab.id === tabId)) return null;
  if (state.tab !== tabId) {
    state.tab = tabId;
    const url = new URL(location.href);
    url.searchParams.set("tab", tabId);
    history.replaceState({ admin: true }, "", url.href);
    $$("[data-tab]", $("#settings-tabs")).forEach(button => button.classList.toggle("is-active", button.dataset.tab === tabId));
    renderBody();
  }
  if (groupIndex === undefined) return $("#settings-tabs");
  const panel = $(`#settings-body .settings-group[data-group="${groupIndex}"]`);
  if (!panel || fieldIndex === undefined) return panel;
  return $(`[data-field-index="${fieldIndex}"]`, panel) || panel;
}

export function setSettingsCategories(categories) {
  state.categories = categories;
  if (state.tab === "gallery" && state.mounted && state.config) renderBody();
}
