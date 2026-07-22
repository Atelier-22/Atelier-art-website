// ============================================================
// comment-count.js
// ADDITIVE ONLY — does not modify gallery-social.js or
// firebase-config.js in any way.
//
// Adds a small live comment-count badge, e.g. "💬 Comments (3)",
// next to the comment toggle button on every artwork card.
// Built as a real React component (useState + useEffect) and
// mounted with ReactDOM into the existing DOM structure that
// gallery-social.js already creates. React/ReactDOM are loaded
// via CDN <script> tags in the HTML — no build step required.
//
// It works for cards that exist on page load AND cards added
// later (owner uploads), by watching the gallery grid with a
// MutationObserver.
// ============================================================

import { watchComments } from "./firebase-config.js";

function whenReactReady(callback) {
  if (window.React && window.ReactDOM) {
    callback();
    return;
  }
  const interval = setInterval(() => {
    if (window.React && window.ReactDOM) {
      clearInterval(interval);
      callback();
    }
  }, 50);
}

// React component: subscribes to live comment count for one artId.
function CommentCountBadge({ artId }) {
  const { useState, useEffect } = window.React;
  const [count, setCount] = useState(null);

  useEffect(() => {
    const unsubscribe = watchComments(artId, (comments) => {
      setCount(comments.length);
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [artId]);

  return window.React.createElement(
    "span",
    { className: "comment-count-badge" },
    count === null ? "" : `(${count})`
  );
}

function mountBadge(card) {
  if (card.dataset.commentCountMounted) return;

  const artId = card.dataset.artId;
  const toggleBtn = card.querySelector(".comment-toggle");
  if (!artId || !toggleBtn) return;

  card.dataset.commentCountMounted = "1";

  const mountPoint = document.createElement("span");
  toggleBtn.appendChild(mountPoint);

  const root = window.ReactDOM.createRoot(mountPoint);
  root.render(window.React.createElement(CommentCountBadge, { artId }));
}

function scanForCards() {
  document.querySelectorAll(".art-card[data-art-id]").forEach(mountBadge);
}

whenReactReady(() => {
  const grid = document.querySelector(".gallery-grid");
  if (!grid) return;

  // Cards built by gallery-social.js on initial load
  scanForCards();

  // Cards added later (e.g. owner uploads triggering a re-render)
  const observer = new MutationObserver(scanForCards);
  observer.observe(grid, { childList: true, subtree: true });
});
