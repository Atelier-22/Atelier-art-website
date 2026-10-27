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


export function modal({
  title, body, confirmLabel = "Confirm", danger = false, onConfirm,
  wide = false, onMount, hideConfirm = false, cancelLabel = "Cancel", onCancel, onClose
}) {
  const overlay = document.createElement("div");
  overlay.className = `modal${wide ? " is-wide" : ""}`;
  overlay.innerHTML = `
    <div class="modal-box" role="dialog" aria-modal="true">
      <h3>${escapeHtml(title)}</h3>
      <div class="modal-sub">${body}</div>
      <div class="modal-actions">
        <button class="btn" data-cancel>${hideConfirm ? "Close" : escapeHtml(cancelLabel)}</button>
        ${hideConfirm ? "" : `
          <button class="btn ${danger ? "is-danger" : "is-primary"}" data-confirm>
            ${escapeHtml(confirmLabel)}
          </button>`}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("is-open"));

  const confirmBtn = $("[data-confirm]", overlay);
  const cancelBtn = $("[data-cancel]", overlay);
  let busy = false;
  let closed = false;
  confirmBtn?.focus();

  function close() {
    if (busy || closed) return;
    closed = true;
    overlay.classList.remove("is-open");
    document.removeEventListener("keydown", onKey);
    onClose?.();
    setTimeout(() => overlay.remove(), 320);
  }

  function onKey(e) {
    if (busy) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    else if (e.key === "Enter" && confirmBtn && !confirmBtn.disabled && !e.target.closest("textarea, button, select")) {
      e.preventDefault();
      e.stopImmediatePropagation();
      confirmBtn.click();
    }
  }
  document.addEventListener("keydown", onKey);

  cancelBtn.addEventListener("click", async () => {
    if (onCancel) {
      busy = true;
      cancelBtn.disabled = true;
      if (confirmBtn) confirmBtn.disabled = true;
      try { await onCancel(); } catch (err) {
        busy = false;
        toast(err.message || "That didn't work.", "error");
        cancelBtn.disabled = false;
        if (confirmBtn) confirmBtn.disabled = false;
        return;
      }
      busy = false;
    }
    close();
  });
  overlay.addEventListener("click", (e) => { if (e.target === overlay && !busy) close(); });

  confirmBtn?.addEventListener("click", async () => {
    busy = true;
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    try {
      await onConfirm();
      busy = false;
      close();
    } catch (err) {
      console.error(err);
      toast(err.message || "That didn't work.", "error");
      const progress = $("[data-delete-progress]", overlay);
      if (progress) {
        progress.hidden = false;
        progress.textContent = `Stopped: ${err.message || "Delete failed."} You can retry or cancel.`;
      }
      busy = false;
      confirmBtn.disabled = false;
      cancelBtn.disabled = false;
    }
  });

  onMount?.(overlay, close);
  return { close, overlay };
}
