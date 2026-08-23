import { observeReveals, initNav } from "./reveal.js?v=20260823a";

/**
 * The prose pages — About and Contact. They have no live data, so mounting is
 * the nav and the reveal observer, and there is nothing to tear down: both are
 * rebound against whatever DOM is on the page when it happens.
 */
export function mount() {
  initNav();
  observeReveals(document);
}

export function unmount() {}

/** Blocks built from the config arrive after the first pass. */
export function onConfig() {
  observeReveals(document);
}
