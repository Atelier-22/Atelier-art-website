// ============================================================
// gallery-social.js
// Loaded by every artwork page (paintings.html, sketches.html,
// digital.html, sculptures.html, comics.html, portraits.html,
// graphics.html). It:
//   1. Silently signs visitors in anonymously so they can comment.
//   2. Wraps every gallery image in a card with a like button and
//      a comment thread (works for the original demo images AND
//      anything the owner uploads later).
//   3. Blocks right-click / drag on every artwork image.
//   4. Shows a working Download button ONLY when the signed-in
//      user is the owner (checked against ADMIN_EMAIL).
// ============================================================

import {
  ensureGuestAuth, slugId,
  watchLikeCount, likeArtwork, getLikedIds,
  watchComments, addComment, watchCategoryArtworks
} from "./firebase-config.js";

const CAT_MAP = {
  'paintings': 'paintings', 'sketches': 'sketches', 'digital art': 'digital',
  'sculptures': 'sculptures', 'comics': 'comics', 'portraits': 'portraits', 'graphics': 'graphics'
};
function getCategory() {
  const t = document.title.toLowerCase();
  for (const k in CAT_MAP) if (t.includes(k)) return CAT_MAP[k];
  return 'general';
}
const CATEGORY = getCategory();

let currentUser = null;

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

// Wraps a bare <img> in a card with like/comment UI. Returns the
// pieces the caller needs, or null if this image is already wrapped.
function buildCard(img, forcedArtId) {
  if (img.closest('.art-card')) return null;

  const filename = (img.getAttribute('src') || '').split('/').pop();
  const artId = forcedArtId || slugId(CATEGORY, img.alt || filename);

  const card = document.createElement('div');
  card.className = 'art-card';
  img.parentNode.insertBefore(card, img);
  card.appendChild(img);

  // --- Anti-theft: block right-click and dragging on the image ---
  img.oncontextmenu = () => false;
  img.ondragstart = () => false;
  img.draggable = false;
  img.style.userSelect = 'none';

  const actions = document.createElement('div');
  actions.className = 'art-actions';
  actions.innerHTML = `
    <button class="like-btn" type="button" aria-label="Like this artwork">
      <span class="heart">🤍</span> <span class="like-count">0</span>
    </button>
    <button class="comment-toggle" type="button">💬 Comments</button>
  `;
  card.appendChild(actions);

  const errorEl = document.createElement('div');
  errorEl.className = 'social-error';
  errorEl.style.cssText = 'display:none; color:#ff8080; font-size:0.8em; text-align:center; padding:4px 10px 0;';
  card.appendChild(errorEl);

  const panel = document.createElement('div');
  panel.className = 'comments-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="comments-list"></div>
    <form class="comment-form">
      <input type="text" class="comment-name" placeholder="Your name (optional)" maxlength="40">
      <textarea class="comment-text" placeholder="Say something about this piece..." maxlength="300" required></textarea>
      <button type="submit">Post</button>
    </form>
  `;
  card.appendChild(panel);

  return { card, img, artId };
}

function showError(errorEl, message) {
  errorEl.textContent = message;
  errorEl.style.display = 'block';
  clearTimeout(errorEl._hideTimer);
  errorEl._hideTimer = setTimeout(() => { errorEl.style.display = 'none'; }, 5000);
}

function wireCard({ card, img, artId }) {
  const actionsRoot = card.querySelector('.art-actions');
  const panelRoot = card.querySelector('.comments-panel');
  const errorEl = card.querySelector('.social-error');
  const likeBtn = actionsRoot.querySelector('.like-btn');
  const heartEl = actionsRoot.querySelector('.heart');
  const likeCountEl = actionsRoot.querySelector('.like-count');
  const toggleBtn = actionsRoot.querySelector('.comment-toggle');
  const commentsList = panelRoot.querySelector('.comments-list');
  const form = panelRoot.querySelector('.comment-form');

  if (getLikedIds().includes(artId)) {
    likeBtn.classList.add('liked');
    likeBtn.disabled = true;
    heartEl.textContent = '❤️';
  }

  watchLikeCount(artId, (count) => { likeCountEl.textContent = count; });

  likeBtn.addEventListener('click', async () => {
    likeBtn.disabled = true;
    try {
      const ok = await likeArtwork(artId, CATEGORY, img.src);
      if (ok) { likeBtn.classList.add('liked'); heartEl.textContent = '❤️'; }
      else { likeBtn.disabled = false; }
    } catch (err) {
      console.error('Like failed for', artId, err);
      likeBtn.disabled = false;
      showError(errorEl, "Couldn't save your like — please try again.");
    }
  });

  toggleBtn.addEventListener('click', () => {
    panelRoot.hidden = !panelRoot.hidden;
  });

  watchComments(artId, (comments) => {
    commentsList.innerHTML = comments.length
      ? comments.map(c => `<div class="comment"><strong>${escapeHtml(c.name)}</strong>: ${escapeHtml(c.text)}</div>`).join('')
      : '<div class="no-comments">No comments yet — be the first!</div>';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameEl = form.querySelector('.comment-name');
    const textEl = form.querySelector('.comment-text');
    if (!textEl.value.trim()) return;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await addComment(artId, nameEl.value, textEl.value, currentUser ? currentUser.uid : null);
      textEl.value = '';
    } catch (err) {
      console.error('Comment failed for', artId, err);
      showError(errorEl, "Couldn't post your comment — please try again.");
    } finally {
      submitBtn.disabled = false;
    }
  });

  card.dataset.artId = artId;
}

function enhanceExistingImages() {
  const grid = document.querySelector('.gallery-grid');
  if (!grid) return;
  Array.from(grid.querySelectorAll('img')).forEach(img => {
    const built = buildCard(img);
    if (built) wireCard(built);
  });
}

function renderUploadedArtworks(items) {
  const grid = document.querySelector('.gallery-grid');
  if (!grid) return;
  // Re-render the "uploaded by owner" cards fresh each time the
  // Firestore listener fires (keeps the grid in sync live).
  grid.querySelectorAll('.art-card[data-uploaded="1"]').forEach(n => n.remove());
  items.forEach(item => {
    const img = document.createElement('img');
    img.src = item.imageUrl;
    img.alt = item.title || 'Artwork';
    grid.appendChild(img);
    const built = buildCard(img, item.id);
    if (built) {
      built.card.dataset.uploaded = '1';
      wireCard(built);
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  currentUser = await ensureGuestAuth();
  enhanceExistingImages();
  watchCategoryArtworks(CATEGORY, renderUploadedArtworks);
});

