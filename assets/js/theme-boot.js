/**
 * Paints the owner's theme before the first frame.
 *
 * Everything else on this site is an ES module, which browsers defer until
 * after the document parses. That is fine for content, and wrong for colour:
 * a deferred theme means the page renders in the shipped palette and then
 * visibly repaints into the real one. So the last known-good palette is cached
 * in localStorage as finished CSS, and this one small classic script — loaded
 * synchronously in <head>, after the stylesheets so it wins the cascade —
 * puts it on the page before anything is drawn.
 *
 * It is deliberately dependency-free and failure-tolerant. If there is no
 * cache, or storage is blocked, nothing happens and the page renders in the
 * palette core.css ships with, which is the same palette the config defaults
 * to. The live document arrives moments later and repaints if it differs.
 */
(function () {
  "use strict";

  var THEME_KEY = "alafi_theme_css";
  var CONFIG_KEY = "alafi_site_config";

  function read(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  var css = read(THEME_KEY);
  if (css) {
    var style = document.createElement("style");
    style.id = "theme-vars";
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* The wallpaper is a per-page image and it is the largest thing on screen,
     so it gets the same treatment: set the custom property on <html> and the
     .wallpaper element picks it up by inheritance the moment it parses. */
  var key = document.documentElement.getAttribute("data-bg");
  if (!key) return;

  try {
    var config = JSON.parse(read(CONFIG_KEY) || "{}");
    var url = config && config.backgrounds && config.backgrounds[key];
    if (typeof url === "string" && url) {
      document.documentElement.style.setProperty("--page-bg", 'url("' + url + '")');
    }
  } catch (e) { /* a corrupt cache is not worth a broken page */ }
})();
