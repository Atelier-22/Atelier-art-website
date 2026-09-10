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

  var key = document.documentElement.getAttribute("data-bg");
  if (!key) return;

  try {
    var config = JSON.parse(read(CONFIG_KEY) || "{}");
    var url = config && config.backgrounds && config.backgrounds[key];
    if (typeof url === "string" && url) {
      document.documentElement.style.setProperty("--page-bg", 'url("' + url + '")');
    }
  } catch (e) { }
})();
