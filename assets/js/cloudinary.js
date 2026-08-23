/**
 * Cloudinary delivery URLs.
 *
 * Separated from data.js because both the data layer and the config layer need
 * these, and data.js reads the config to know whether automatic quality is
 * switched on. Left where they were, that would have been a circular import.
 *
 * Nothing here talks to Cloudinary — these are pure string transformations on
 * URLs that already exist, and every one of them is reversible by dropping the
 * transform back out again.
 */

export function isCloudinaryUrl(url) {
  return typeof url === "string" && url.includes("res.cloudinary.com") && url.includes("/upload/");
}

/**
 * Inserts a transformation, replacing any already present.
 *
 * A Cloudinary URL is `.../upload/[transforms/]v<version>/<public_id>.<ext>`.
 * Everything between `upload/` and the version segment is transformation, so
 * that is what gets replaced — the asset the URL points at never changes.
 */
export function withTransform(url, transform) {
  if (!isCloudinaryUrl(url) || !transform) return url;
  const [head, tail] = url.split("/upload/");
  const clean = tail.replace(/^(?:(?!v\d+\/)[^/]+\/)+/, "");
  return `${head}/upload/${transform}/${clean}`;
}

/**
 * The still Cloudinary generates from a video, two seconds in — far enough
 * past a fade from black on most clips to show something. Saves the owner
 * making and uploading a poster frame by hand.
 */
export function posterFromVideo(url) {
  if (!isCloudinaryUrl(url)) return "";
  return withTransform(url, "so_2,q_auto,f_jpg").replace(/\.[a-z0-9]+$/i, ".jpg");
}

/** Anything longer than this is trimmed on the way out. */
export const VIDEO_TRIM_SECONDS = 120;

/**
 * Video on the way out: compressed, re-encoded for the viewer's browser, and
 * trimmed to two minutes if it runs longer.
 *
 * `q_auto:best` is the gentlest setting Cloudinary offers — it picks a quality
 * per frame and stops the moment the result would be visibly different from
 * the source. That is what "compress it without changing the quality" can
 * actually mean: the file gets smaller because modern codecs encode the same
 * picture in fewer bytes, not because detail is thrown away. Asking for
 * genuinely lossless would save almost nothing and defeat the point.
 *
 * `vc_auto` lets the codec follow the browser — AV1 or VP9 where they are
 * supported, H.264 where they are not — which is where most of the saving
 * comes from.
 *
 * The original upload is never altered. All of this is the delivery address,
 * so it can be changed or dropped later and the master is still there.
 */
export function videoDeliveryUrl(url, { duration = null, trim = true } = {}) {
  if (!isCloudinaryUrl(url)) return url;

  const parts = ["q_auto:best", "vc_auto"];
  // Only trim when it is actually needed: a duration cap on a short clip is a
  // transformation Cloudinary has to compute for no reason.
  if (trim && typeof duration === "number" && duration > VIDEO_TRIM_SECONDS) {
    parts.push(`du_${VIDEO_TRIM_SECONDS}`);
  }
  return withTransform(url, parts.join(","));
}

/**
 * An image at automatic format and quality, capped to a sensible width.
 *
 * This is the whole bandwidth saving: the originals here average 578 KB and
 * run to 3.4 MB, and `f_auto,q_auto` typically lands the same picture nearer
 * 100 KB by serving AVIF or WebP at a quality chosen per image. `w_1800`
 * stops a 6000-pixel scan being sent to a phone; `c_limit` means nothing is
 * ever cropped or enlarged, only shrunk when it is bigger than the cap.
 *
 * Off unless the owner switches it on, because it changes the delivery address
 * of every existing image.
 */
export function imageDeliveryUrl(url, enabled) {
  if (!isCloudinaryUrl(url)) return url;
  // Switching it off strips the transform rather than merely stopping adding
  // one, so a URL that was stored while it was on still reverts cleanly.
  return enabled ? withTransform(url, "f_auto,q_auto,w_1800,c_limit") : stripTransform(url);
}

/** The plain asset URL, whatever transformation it currently carries. */
export function stripTransform(url) {
  if (!isCloudinaryUrl(url)) return url;
  const [head, tail] = url.split("/upload/");
  return `${head}/upload/${tail.replace(/^(?:(?!v\d+\/)[^/]+\/)+/, "")}`;
}
