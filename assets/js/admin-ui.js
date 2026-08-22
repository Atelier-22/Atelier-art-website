/**
 * The pieces of admin chrome that more than one view needs: toasts, the modal,
 * and the confirmation it is built on. Extracted from admin.js when the
 * settings and preview views arrived, so all three share one modal rather than
 * growing three that drift apart.
 */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

export function relativeTime(seconds) {
  if (!seconds) return "just now";
  const diff = Date.now() / 1000 - seconds;
  const units = [[31536000, "yr"], [2592000, "mo"], [604800, "wk"], [86400, "d"], [3600, "h"], [60, "m"]];
  for (const [size, label] of units) {
    if (diff >= size) return `${Math.floor(diff / size)}${label} ago`;
  }
  return "just now";
}

/* ------------------------------------------------------------------ */
/*  Toasts                                                             */
/* ------------------------------------------------------------------ */

let toastHost = null;

export function toast(message, kind = "") {
  if (!toastHost) {
    toastHost = document.createElement("div");
    toastHost.className = "toast-host";
    document.body.appendChild(toastHost);
  }
  const el = document.createElement("div");
  el.className = `toast ${kind ? `is-${kind}` : ""}`;
  el.textContent = message;
  toastHost.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity .3s";
    setTimeout(() => el.remove(), 320);
  }, 4200);
}

/* ------------------------------------------------------------------ */
/*  Modal                                                              */
/* ------------------------------------------------------------------ */

export function modal({
  title, body, confirmLabel = "Confirm", danger = false, onConfirm,
  confirmPhrase, wide = false, onMount, hideConfirm = false
}) {
  const overlay = document.createElement("div");
  overlay.className = `modal${wide ? " is-wide" : ""}`;
  overlay.innerHTML = `
    <div class="modal-box" role="dialog" aria-modal="true">
      <h3>${escapeHtml(title)}</h3>
      <div class="modal-sub">${body}</div>
      ${confirmPhrase ? `
        <div class="confirm-guard">
          <p>This can't be undone. Type <code>${escapeHtml(confirmPhrase)}</code> to confirm.</p>
          <input type="text" class="guard-input" autocomplete="off" placeholder="${escapeHtml(confirmPhrase)}">
        </div>` : ""}
      <div class="modal-actions">
        <button class="btn" data-cancel>${hideConfirm ? "Close" : "Cancel"}</button>
        ${hideConfirm ? "" : `
          <button class="btn ${danger ? "is-danger" : "is-primary"}" data-confirm ${confirmPhrase ? "disabled" : ""}>
            ${escapeHtml(confirmLabel)}
          </button>`}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("is-open"));

  const confirmBtn = $("[data-confirm]", overlay);
  const guard = $(".guard-input", overlay);

  if (guard) {
    guard.addEventListener("input", () => {
      confirmBtn.disabled = guard.value.trim() !== confirmPhrase;
    });
    guard.focus();
  } else {
    confirmBtn?.focus();
  }

  function close() {
    overlay.classList.remove("is-open");
    document.removeEventListener("keydown", onKey);
    setTimeout(() => overlay.remove(), 320);
  }

  function onKey(e) { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", onKey);

  $("[data-cancel]", overlay).addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  confirmBtn?.addEventListener("click", async () => {
    confirmBtn.disabled = true;
    try {
      await onConfirm();
      close();
    } catch (err) {
      console.error(err);
      toast(err.message || "That didn't work.", "error");
      confirmBtn.disabled = false;
    }
  });

  onMount?.(overlay, close);
  return { close, overlay };
}

export function confirmDelete({ what, name, extra = "", onConfirm }) {
  return modal({
    title: `Delete this ${what}?`,
    body: `<b>${escapeHtml(name)}</b> will be permanently removed from the site.${extra ? ` ${extra}` : ""}`,
    confirmLabel: `Delete ${what}`,
    danger: true,
    confirmPhrase: "DELETE",
    onConfirm
  });
}
