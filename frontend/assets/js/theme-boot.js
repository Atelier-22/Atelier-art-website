(function () {
  "use strict";

  var css = null;
  try { css = localStorage.getItem("alafi_theme_css"); }
  catch (e) { console.error("Theme cache unreadable.", e); }
  try { localStorage.removeItem("alafi_site_config"); }
  catch (e) { console.error("Old settings cache could not be cleared.", e); }

  if (css) {
    var style = document.createElement("style");
    style.id = "theme-vars";
    style.textContent = css;
    document.head.appendChild(style);
  }
})();
