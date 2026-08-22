import { observeReveals, initNav } from "./reveal.js?v=20260823a";
import { initContent } from "./site-content.js?v=20260823a";

initNav();
observeReveals(document);

// Blocks rendered from the config arrive after the first pass, so they need
// their own observer registration once they exist.
initContent(() => observeReveals(document));
