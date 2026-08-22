/**
 * The Settings view — one page, every site-wide setting on it.
 *
 * The form is generated from the TABS schema below rather than written into
 * admin.html. That is the whole reason settings can stay consolidated: adding
 * a control is one line in a list, so there is never a reason to tuck the next
 * one away in some other view where it happens to be convenient.
 *
 * Every edit writes to siteConfig/draft, debounced. Nothing here touches the
 * live site until Publish is pressed, and the preview iframe is listening to
 * that same draft document, so typing in a field moves the preview.
 */

import {
  DEFAULT_CONFIG, DISPLAY_FONTS, BODY_FONTS, fetchConfig, saveDraft,
  publishDraft, discardDraft, contrastReport, hasBlockingContrastFailure,
  derivePalette, mergeConfig
} from "./site-config.js?v=20260823a";
import { uploadAndRecord, watchMedia } from "./data.js?v=20260823a";
import { LOCAL_SEEDS, CATEGORY_BY_SLUG } from "./site-data.js?v=20260823a";
import { $, $$, escapeHtml, toast, modal } from "./admin-ui.js?v=20260823a";

/* Images that ship with the site and are not in the media library, so they can
   still be picked as a background or a portrait. */
const ROOT_IMAGES = ["1.jpg", "2.jpg", "AJ.jpeg", "AJ1.jpg", "AJ2.JPG", "tt.JPG"];

const state = {
  draft: null,
  published: null,
  tab: "theme",
  dirty: false,
  saveTimer: null,
  mounted: false,
  categories: [],
  media: [],
  onChange: null
};

/* ------------------------------------------------------------------ */
/*  Schema                                                             */
/* ------------------------------------------------------------------ */

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
          { type: "image", path: "branding.logoUrl", label: "Logo", note: "Optional. When set it replaces the written wordmark in the header on every page. Leave empty to use the text below." },
          { type: "text", path: "branding.wordmark", label: "Wordmark", placeholder: "Alafi" },
          { type: "text", path: "branding.wordmarkDot", label: "Accent character", note: "The bit after the name, shown in the accent colour." },
          { type: "text", path: "branding.siteTitle", label: "Site name", note: "Used in the footer." }
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
          { type: "textarea", path: "home.artistCopy", label: "Introduction", rows: 5, note: "Leave a blank line between paragraphs." }
        ]
      },
      {
        title: "Closing block",
        fields: [
          { type: "text", path: "home.finaleEyebrow", label: "Eyebrow" },
          { type: "text", path: "home.finaleTitle", label: "Heading" },
          { type: "textarea", path: "home.finaleBlurb", label: "Text", rows: 2 }
        ]
      }
    ]
  },

  {
    id: "story",
    label: "Story",
    note: "A section on the homepage, directly below the artist block. Write the story, the bio, or an artist statement — whatever it should say. It disappears from the site entirely when switched off or left empty.",
    groups: [
      {
        title: "The section",
        fields: [
          { type: "toggle", path: "story.enabled", label: "Show this section on the homepage" },
          { type: "text", path: "story.eyebrow", label: "Eyebrow" },
          { type: "text", path: "story.heading", label: "Heading" },
          { type: "textarea", path: "story.body", label: "The story", rows: 12, note: "Leave a blank line between paragraphs." }
        ]
      },
      {
        title: "Accompanying media",
        note: "Optional. Sits beside the text on a wide screen and above it on a phone.",
        fields: [
          { type: "image", path: "story.mediaUrl", label: "Image or video" },
          {
            type: "select", path: "story.mediaType", label: "Type",
            options: [
              { value: "", label: "None" },
              { value: "image", label: "Image" },
              { value: "video", label: "Video" }
            ]
          },
          { type: "image", path: "story.mediaPoster", label: "Video still", note: "Shown before a video is played. Ignored for images." }
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
    note: "The collections index. Names and descriptions come from Categories; the cover images are here.",
    groups: [
      {
        title: "Header",
        fields: [
          { type: "text", path: "gallery.title", label: "Page title" },
          { type: "text", path: "gallery.tagline", label: "Tagline" },
          { type: "textarea", path: "gallery.blurb", label: "Introduction", rows: 3 }
        ]
      },
      { title: "Collection covers", fields: [{ type: "covers", path: "gallery.covers" }] }
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
          { type: "image", path: "backgrounds.contact", label: "Contact" }
        ]
      }
    ]
  }
];

/* ------------------------------------------------------------------ */
/*  Path access                                                        */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Image picker                                                       */
/* ------------------------------------------------------------------ */

function bundledImageGroups() {
  const groups = [{ label: "Site images", items: ROOT_IMAGES }];
  Object.keys(LOCAL_SEEDS).forEach((slug) => {
    const items = LOCAL_SEEDS[slug] || [];
    if (items.length) groups.push({ label: CATEGORY_BY_SLUG[slug]?.label || slug, items });
  });
  return groups;
}

/**
 * Three ways to choose a picture, because there are three places one can come
 * from: a new file, something already uploaded, or one of the images that
 * shipped with the site. Resolves to a URL, or null if cancelled.
 */
export function pickImage(current = "") {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value, close) => {
      if (settled) return;
      settled = true;
      resolve(value);
      close();
    };

    const groups = bundledImageGroups();

    modal({
      title: "Choose an image",
      wide: true,
      hideConfirm: true,
      body: `
        <div class="picker">
          <div class="picker-tabs">
            <button type="button" class="is-active" data-ptab="upload">Upload</button>
            <button type="button" data-ptab="library">Library</button>
            <button type="button" data-ptab="bundled">Site images</button>
            <button type="button" data-ptab="url">Address</button>
          </div>

          <div class="picker-pane is-active" data-pane="upload">
            <div class="dropzone" data-pick-drop>
              <strong>Drop a file here, or click to choose</strong>
              <span>Uploaded to Cloudinary and added to your library</span>
              <!-- Images only for now. The story block already renders a
                   video when its media type says so, but uploading one needs
                   Cloudinary's video endpoint and a decision about bandwidth
                   that has not been taken yet -- see the video report. -->
              <input type="file" accept="image/*" data-pick-input>
            </div>
            <div class="progress" data-pick-progress hidden><span></span></div>
            <p class="status-line" data-pick-status></p>
          </div>

          <div class="picker-pane" data-pane="library">
            <div class="picker-grid" data-pick-library><p class="empty-note">Loading…</p></div>
          </div>

          <div class="picker-pane" data-pane="bundled">
            <div class="toolbar">
              <select data-pick-group>
                ${groups.map((g, i) => `<option value="${i}">${escapeHtml(g.label)}</option>`).join("")}
              </select>
            </div>
            <div class="picker-grid" data-pick-bundled></div>
          </div>

          <div class="picker-pane" data-pane="url">
            <div class="field">
              <label>Image address</label>
              <input type="text" data-pick-url value="${escapeHtml(current)}" placeholder="https://… or 2.jpg">
            </div>
            <button class="btn is-primary" type="button" data-pick-url-go>Use this address</button>
            <p class="form-note">Also how you clear a picture: empty the box and press the button.</p>
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

        /* Upload */
        const input = $("[data-pick-input]", overlay);
        const drop = $("[data-pick-drop]", overlay);
        const bar = $("[data-pick-progress]", overlay);
        const status = $("[data-pick-status]", overlay);

        const upload = async (file) => {
          if (!file) return;
          bar.hidden = false;
          status.textContent = `Uploading ${file.name}…`;
          try {
            const asset = await uploadAndRecord(file, {
              usedFor: "site",
              onProgress: (p) => { bar.firstElementChild.style.width = `${p * 100}%`; }
            });
            finish(asset.url, close);
          } catch (err) {
            console.error(err);
            status.textContent = err.message || "That upload failed.";
            bar.hidden = true;
          }
        };

        drop.addEventListener("click", () => input.click());
        input.addEventListener("change", () => upload(input.files[0]));
        ["dragenter", "dragover"].forEach(ev =>
          drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("is-dragging"); }));
        ["dragleave", "drop"].forEach(ev =>
          drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("is-dragging"); }));
        drop.addEventListener("drop", e => upload(e.dataTransfer.files[0]));

        /* Library */
        const libraryHost = $("[data-pick-library]", overlay);
        const paintLibrary = () => {
          libraryHost.innerHTML = state.media.length
            ? state.media.map(m => `
                <button type="button" class="picker-item${m.url === current ? " is-current" : ""}" data-url="${escapeHtml(m.url)}">
                  <img src="${escapeHtml(m.url)}" alt="" loading="lazy">
                  <span>${escapeHtml(m.filename || m.publicId || "")}</span>
                </button>`).join("")
            : '<p class="empty-note">Nothing uploaded yet. Use the Upload tab.</p>';
        };
        paintLibrary();

        /* Bundled */
        const bundledHost = $("[data-pick-bundled]", overlay);
        const groupSelect = $("[data-pick-group]", overlay);
        const paintBundled = () => {
          const group = groups[Number(groupSelect.value)] || groups[0];
          bundledHost.innerHTML = group.items.map(src => `
            <button type="button" class="picker-item${src === current ? " is-current" : ""}" data-url="${escapeHtml(src)}">
              <img src="${escapeHtml(src)}" alt="" loading="lazy">
              <span>${escapeHtml(src.split("/").pop())}</span>
            </button>`).join("");
        };
        groupSelect.addEventListener("change", paintBundled);
        paintBundled();

        overlay.addEventListener("click", (e) => {
          const item = e.target.closest(".picker-item");
          if (item) finish(item.dataset.url, close);
        });

        /* Address */
        $("[data-pick-url-go]", overlay).addEventListener("click", () => {
          finish($("[data-pick-url]", overlay).value.trim(), close);
        });

        $("[data-cancel]", overlay).addEventListener("click", () => {
          if (!settled) { settled = true; resolve(null); }
        });
      }
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Field rendering                                                    */
/* ------------------------------------------------------------------ */

function markDirty() {
  state.dirty = true;
  renderStatus();
  clearTimeout(state.saveTimer);
  // Debounced rather than immediate: the preview is driven by this write, and
  // saving on every keystroke would make it flicker through half-typed words.
  state.saveTimer = setTimeout(commit, 550);
}

async function commit() {
  try {
    await saveDraft(state.draft);
    state.dirty = false;
    renderStatus();
    state.onChange?.(state.draft);
  } catch (err) {
    console.error(err);
    toast(err.message || "Could not save the draft.", "error");
  }
}

function fieldShell(label, note, control, extraClass = "") {
  return `
    <div class="setting ${extraClass}">
      ${label ? `<label class="setting-label">${escapeHtml(label)}</label>` : ""}
      <div class="setting-control">${control}</div>
      ${note ? `<p class="setting-note">${escapeHtml(note)}</p>` : ""}
    </div>`;
}

/**
 * Field types that carry a grid, a list, or a table of their own. They span
 * the whole settings panel: a repeatable list squeezed into one column of a
 * two-column form is unusable, and the class has to sit on the grid child
 * rather than on something inside it or it does nothing at all.
 */
const FULL_WIDTH_FIELDS = new Set([
  "images", "list", "blocks", "covers", "contrast", "swatches", "typepreview"
]);

function renderField(field) {
  const value = field.path ? get(state.draft, field.path) : undefined;
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
        set(state.draft, field.path, next);
        picker.value = next;
        hex.value = next;
        markDirty();
        renderLiveTheme();
      };
      picker.addEventListener("input", () => apply(picker.value));
      hex.addEventListener("change", () => {
        const next = hex.value.trim();
        if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(next)) apply(next);
        else hex.value = get(state.draft, field.path) || "";
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
        set(state.draft, field.path, sanitise(input.value, field.type === "html"));
        markDirty();
      });
      break;
    }

    case "textarea": {
      el.innerHTML = fieldShell(field.label, field.note,
        `<textarea data-setting rows="${field.rows || 4}">${escapeHtml(value ?? "")}</textarea>`);
      const input = $("[data-setting]", el);
      input.addEventListener("input", () => {
        set(state.draft, field.path, input.value);
        markDirty();
      });
      break;
    }

    case "select": {
      el.innerHTML = fieldShell(field.label, field.note, `
        <select data-setting>
          ${field.options.map(o => `
            <option value="${escapeHtml(o.value)}"${o.value === value ? " selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}
        </select>`);
      const input = $("[data-setting]", el);
      input.addEventListener("change", () => {
        set(state.draft, field.path, input.value);
        markDirty();
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
        set(state.draft, field.path, Number(input.value));
        out.textContent = `${input.value}${field.suffix || ""}`;
        markDirty();
        renderLiveTheme();
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
        set(state.draft, field.path, input.checked);
        markDirty();
      });
      break;
    }

    case "image":
      el.appendChild(imageField(field.label, field.note, value, (next) => {
        set(state.draft, field.path, next);
        markDirty();
      }));
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

/**
 * Owner-authored copy is allowed a little inline markup, because the headline
 * genuinely needs an <em> in the middle of it. Everything that could execute
 * is removed rather than escaped, so a pasted-in snippet degrades to its text.
 */
function sanitise(value, allowMarkup) {
  if (!allowMarkup) return value;
  return value
    .replace(/<\s*\/?\s*(script|style|iframe|object|embed|link|meta)\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

function imageField(label, note, value, onPick) {
  const el = document.createElement("div");
  el.className = "setting";
  el.innerHTML = `
    ${label ? `<label class="setting-label">${escapeHtml(label)}</label>` : ""}
    <div class="setting-control">
      <div class="image-field">
        <div class="image-thumb" data-thumb>
          ${value ? `<img src="${escapeHtml(value)}" alt="">` : '<span class="image-empty">None</span>'}
        </div>
        <div class="image-actions">
          <button class="btn is-small" type="button" data-choose>${value ? "Replace" : "Choose"}</button>
          <button class="btn is-small is-danger" type="button" data-clear ${value ? "" : "hidden"}>Remove</button>
          <code class="image-path" data-path>${escapeHtml(value || "")}</code>
        </div>
      </div>
    </div>
    ${note ? `<p class="setting-note">${escapeHtml(note)}</p>` : ""}`;

  const paint = (next) => {
    $("[data-thumb]", el).innerHTML = next
      ? `<img src="${escapeHtml(next)}" alt="">`
      : '<span class="image-empty">None</span>';
    $("[data-choose]", el).textContent = next ? "Replace" : "Choose";
    $("[data-clear]", el).hidden = !next;
    $("[data-path]", el).textContent = next || "";
  };

  $("[data-choose]", el).addEventListener("click", async () => {
    const next = await pickImage(value);
    if (next === null) return;
    value = next;
    paint(next);
    onPick(next);
  });

  $("[data-clear]", el).addEventListener("click", () => {
    value = "";
    paint("");
    onPick("");
  });

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
    const items = get(state.draft, field.path) || [];
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
    const items = (get(state.draft, field.path) || []).slice();
    const button = e.target.closest("button");
    if (!button) return;

    if (button.dataset.add !== undefined) {
      const next = await pickImage("");
      if (!next) return;
      items.push(next);
    } else if (button.dataset.up !== undefined) {
      const i = Number(button.dataset.up);
      [items[i - 1], items[i]] = [items[i], items[i - 1]];
    } else if (button.dataset.down !== undefined) {
      const i = Number(button.dataset.down);
      [items[i + 1], items[i]] = [items[i], items[i + 1]];
    } else if (button.dataset.remove !== undefined) {
      items.splice(Number(button.dataset.remove), 1);
    } else {
      return;
    }

    set(state.draft, field.path, items);
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
    const items = get(state.draft, field.path) || [];
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
    const items = (get(state.draft, field.path) || []).slice();
    items[Number(input.dataset.i)] = { ...items[Number(input.dataset.i)], [input.dataset.key]: input.value };
    set(state.draft, field.path, items);
    markDirty();
  });

  host.addEventListener("click", (e) => {
    const button = e.target.closest("button");
    if (!button) return;
    const items = (get(state.draft, field.path) || []).slice();

    if (button.dataset.add !== undefined) items.push({ ...(field.defaultItem || {}) });
    else if (button.dataset.up !== undefined) {
      const i = Number(button.dataset.up);
      [items[i - 1], items[i]] = [items[i], items[i - 1]];
    } else if (button.dataset.down !== undefined) {
      const i = Number(button.dataset.down);
      [items[i + 1], items[i]] = [items[i], items[i + 1]];
    } else if (button.dataset.remove !== undefined) items.splice(Number(button.dataset.remove), 1);
    else return;

    set(state.draft, field.path, items);
    paint();
    markDirty();
  });

  paint();
  return el;
}

/* ------------------------------------------------------------------ */
/*  About page blocks                                                  */
/* ------------------------------------------------------------------ */

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

  const read = () => (get(state.draft, field.path) || []).slice();
  const write = (blocks) => { set(state.draft, field.path, blocks); markDirty(); };

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

/* ------------------------------------------------------------------ */
/*  Gallery covers — one per collection that exists                    */
/* ------------------------------------------------------------------ */

function coversField(field) {
  const el = document.createElement("div");
  el.className = "setting is-full";
  el.innerHTML = '<div class="setting-control"><div class="cover-grid" data-list></div></div>';
  const host = $("[data-list]", el);

  const paint = () => {
    host.innerHTML = "";
    const categories = state.categories.length
      ? state.categories
      : Object.keys(CATEGORY_BY_SLUG).map(slug => ({ slug, name: CATEGORY_BY_SLUG[slug].label }));

    if (!categories.length) {
      host.innerHTML = '<p class="empty-note">No collections yet.</p>';
      return;
    }

    categories.forEach((category) => {
      const path = `${field.path}.${category.slug}`;
      host.appendChild(imageField(category.name || category.slug, "", get(state.draft, path) || "", (next) => {
        set(state.draft, path, next);
        markDirty();
      }));
    });
  };

  paint();
  el._repaint = paint;
  return el;
}

/* ------------------------------------------------------------------ */
/*  Live theme feedback                                                */
/* ------------------------------------------------------------------ */

/**
 * Swatches, the type sample, and the contrast table repaint on every colour
 * change. The admin panel itself is deliberately NOT re-themed: the owner
 * needs a stable surface to work from, and a palette that has just been made
 * unreadable must not take the controls for fixing it down with it.
 */
function renderLiveTheme() {
  const palette = derivePalette(state.draft.theme);

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
    const report = contrastReport(state.draft.theme);
    host.innerHTML = report.map(row => `
      <div class="contrast-row is-${row.level}">
        <span class="contrast-chip" style="background:${row.bg};color:${row.fg}">Aa</span>
        <span class="contrast-label">${escapeHtml(row.label)}</span>
        <span class="contrast-ratio">${row.ratio.toFixed(1)}:1</span>
        <span class="contrast-verdict">${row.level === "pass" ? "Readable" : row.level === "warn" ? "Marginal" : "Too low"}</span>
      </div>`).join("") +
      (report.some(r => r.level === "fail")
        ? '<p class="contrast-block">Publishing is blocked while anything here is too low to read.</p>'
        : "");
  });

  renderStatus();
}

/* ------------------------------------------------------------------ */
/*  Status bar                                                         */
/* ------------------------------------------------------------------ */

function unpublishedCount() {
  if (!state.published) return 0;
  let count = 0;
  const walk = (a, b) => {
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    keys.forEach((key) => {
      if (key === "updatedAt" || key === "publishedAt") return;
      const x = a?.[key];
      const y = b?.[key];
      if (x && y && typeof x === "object" && typeof y === "object" && !Array.isArray(x) && !Array.isArray(y)) {
        walk(x, y);
      } else if (JSON.stringify(x) !== JSON.stringify(y)) {
        count++;
      }
    });
  };
  walk(state.draft, state.published);
  return count;
}

function renderStatus() {
  const host = $("#settings-status");
  if (!host) return;

  const pending = unpublishedCount();
  const blocked = hasBlockingContrastFailure(state.draft.theme);

  host.textContent = state.dirty
    ? "Saving…"
    : pending
      ? `${pending} unpublished change${pending === 1 ? "" : "s"}`
      : "Everything is published";
  host.className = `settings-status${pending ? " is-pending" : " is-clean"}`;

  const publish = $("#settings-publish");
  if (publish) {
    publish.disabled = blocked || (!pending && !state.dirty);
    publish.title = blocked ? "Fix the readability warnings first." : "";
  }
  const discard = $("#settings-discard");
  if (discard) discard.disabled = !pending && !state.dirty;
}

/* ------------------------------------------------------------------ */
/*  Mounting                                                           */
/* ------------------------------------------------------------------ */

function renderTabs() {
  const host = $("#settings-tabs");
  host.innerHTML = TABS.map(tab => `
    <button type="button" data-tab="${tab.id}"${tab.id === state.tab ? ' class="is-active"' : ""}>${escapeHtml(tab.label)}</button>`).join("");

  host.addEventListener("click", (e) => {
    const button = e.target.closest("[data-tab]");
    if (!button) return;
    state.tab = button.dataset.tab;
    $$("[data-tab]", host).forEach(b => b.classList.toggle("is-active", b === button));
    renderBody();
  });
}

function renderBody() {
  const host = $("#settings-body");
  const tab = TABS.find(t => t.id === state.tab) || TABS[0];

  // Notes are escaped, not trusted: several of them name an HTML tag as part
  // of the instruction, and unescaped they were rendering as that tag instead
  // of saying its name.
  host.innerHTML = tab.note ? `<p class="settings-intro">${escapeHtml(tab.note)}</p>` : "";

  tab.groups.forEach((group) => {
    const panel = document.createElement("div");
    panel.className = "panel settings-group";
    panel.innerHTML = `
      <h2>${escapeHtml(group.title)}</h2>
      ${group.note ? `<p class="panel-sub">${escapeHtml(group.note)}</p>` : ""}
      <div class="settings-fields"></div>`;
    const fields = $(".settings-fields", panel);
    group.fields.forEach(field => fields.appendChild(renderField(field)));
    host.appendChild(panel);
  });

  renderLiveTheme();
}

/**
 * Loads the draft, creating it from whatever is live the first time. Without
 * this the first edit would be made against the shipped defaults rather than
 * against the site as it actually stands.
 */
async function loadDrafts() {
  const [draft, published] = await Promise.all([fetchConfig("draft"), fetchConfig("published")]);
  state.published = published;

  const draftIsEmpty = JSON.stringify(draft) === JSON.stringify(DEFAULT_CONFIG)
    && JSON.stringify(published) !== JSON.stringify(DEFAULT_CONFIG);

  state.draft = mergeConfig(draftIsEmpty ? published : draft);
  if (draftIsEmpty) await saveDraft(state.draft);
}

export async function initSettings({ onChange } = {}) {
  if (state.mounted) return;
  state.mounted = true;
  state.onChange = onChange;

  await loadDrafts();

  renderTabs();
  renderBody();

  watchMedia((items) => { state.media = items; }, () => { state.media = []; });

  $("#settings-publish").addEventListener("click", async () => {
    const button = $("#settings-publish");
    button.disabled = true;
    try {
      clearTimeout(state.saveTimer);
      await saveDraft(state.draft);
      state.published = await publishDraft();
      state.dirty = false;
      toast("Published — the change is live.", "ok");
      renderStatus();
      state.onChange?.(state.draft);
    } catch (err) {
      console.error(err);
      toast(err.message || "Could not publish.", "error");
      button.disabled = false;
    }
  });

  $("#settings-discard").addEventListener("click", () => {
    modal({
      title: "Throw away the draft?",
      body: "Every unpublished change goes back to what is currently live. This cannot be undone.",
      confirmLabel: "Discard changes",
      danger: true,
      onConfirm: async () => {
        clearTimeout(state.saveTimer);
        state.draft = await discardDraft();
        state.dirty = false;
        renderBody();
        toast("Draft reset to the live site.", "ok");
        state.onChange?.(state.draft);
      }
    });
  });
}

/** Category list feeds the per-collection cover pickers. */
export function setSettingsCategories(categories) {
  state.categories = categories;
  if (state.tab === "gallery" && state.mounted) renderBody();
}
