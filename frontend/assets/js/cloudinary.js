export function isCloudinaryUrl(url) {
  return typeof url === "string" && url.includes("res.cloudinary.com") && url.includes("/upload/");
}

export function withTransform(url, transform) {
  if (!isCloudinaryUrl(url) || !transform) return url;
  const [head, tail] = url.split("/upload/");
  const clean = tail.replace(/^(?:(?!v\d+\/)[^/]+\/)+/, "");
  return `${head}/upload/${transform}/${clean}`;
}

export function posterFromVideo(url) {
  if (!isCloudinaryUrl(url)) return "";
  return withTransform(url, "so_2,q_auto,f_jpg").replace(/\.[a-z0-9]+$/i, ".jpg");
}

export const VIDEO_TRIM_SECONDS = 120;

export function videoDeliveryUrl(url, { duration = null, trim = true } = {}) {
  if (!isCloudinaryUrl(url)) return url;

  const parts = ["q_auto:best", "vc_auto"];
  if (trim && typeof duration === "number" && duration > VIDEO_TRIM_SECONDS) {
    parts.push(`du_${VIDEO_TRIM_SECONDS}`);
  }
  return withTransform(url, parts.join(","));
}

export function imageDeliveryUrl(url, enabled) {
  if (!isCloudinaryUrl(url)) return url;
  return enabled ? withTransform(url, "f_auto,q_auto,w_1800,c_limit") : stripTransform(url);
}

export function stripTransform(url) {
  if (!isCloudinaryUrl(url)) return url;
  const [head, tail] = url.split("/upload/");
  return `${head}/upload/${tail.replace(/^(?:(?!v\d+\/)[^/]+\/)+/, "")}`;
}
