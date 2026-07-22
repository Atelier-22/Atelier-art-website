// ============================================================
// admin-stats.js
// ADDITIVE ONLY — does not modify firebase-config.js.
// Provides two site-wide totals for the admin dashboard:
//   - watchTotalLikes()    -> sum of "likes" across every artwork
//   - watchTotalComments() -> count of every comment, across every
//                             artwork (needs a Firestore collection
//                             group query — see firestore.rules)
// ============================================================

import { db } from "./firebase-config.js";
import {
  collection, collectionGroup, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Sums the "likes" field across every document in /artworks.
export function watchTotalLikes(callback, onError) {
  return onSnapshot(collection(db, "artworks"), (snap) => {
    let total = 0;
    snap.forEach((docSnap) => {
      total += (docSnap.data().likes || 0);
    });
    callback(total);
  }, (err) => {
    console.error("watchTotalLikes error:", err);
    if (onError) onError(err);
  });
}

// Counts every document across every /artworks/{artId}/comments
// subcollection, using a Firestore collection group query.
// Requires the collection-group rule in firestore.rules to be
// published in the Firebase Console (see SETUP_README.md).
export function watchTotalComments(callback, onError) {
  return onSnapshot(collectionGroup(db, "comments"), (snap) => {
    callback(snap.size);
  }, (err) => {
    console.error("watchTotalComments error:", err);
    if (onError) onError(err);
  });
}
// Same collection-group query as above, but returns the full
// comment data (name, text, which artwork) instead of just a
// count — used for the clickable "view all comments" list.
export function watchAllComments(callback, onError) {
  return onSnapshot(collectionGroup(db, "comments"), (snap) => {
    const items = snap.docs.map((docSnap) => {
      const data = docSnap.data();
      const artId = docSnap.ref.parent.parent
        ? docSnap.ref.parent.parent.id
        : "unknown";
      return {
        id: docSnap.id,
        artId,
        name: data.name || "Guest",
        text: data.text || "",
        createdAt: (data.createdAt && data.createdAt.toMillis)
          ? data.createdAt.toMillis() : 0
      };
    });
    items.sort((a, b) => b.createdAt - a.createdAt); // newest first
    callback(items);
  }, (err) => {
    console.error("watchAllComments error:", err);
    if (onError) onError(err);
  });
}
