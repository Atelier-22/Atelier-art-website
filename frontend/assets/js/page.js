import { observeReveals, initNav } from "./reveal.js?v=20260823a";

export function mount() {
  initNav();
  observeReveals(document);
}

export function unmount() {}

export function onConfig() {
  observeReveals(document);
}
