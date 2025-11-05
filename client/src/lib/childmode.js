// src/lib/childmode.js
const KEY = "app.childmode";
const EVT = "app:childmode";

export function isKidMode() {
  const ls = (localStorage.getItem(KEY) || "0") === "1";
  const bodyFlag = (document.body.dataset.childmode || "") === "1";
  return ls || bodyFlag || document.body.classList.contains("kid");
}

export function setKidMode(on) {
  localStorage.setItem(KEY, on ? "1" : "0");
  document.body.classList.toggle("kid", on);
  document.body.dataset.childmode = on ? "1" : "0";
  window.dispatchEvent(new CustomEvent(EVT, { detail: on }));
}

export function subscribeKidMode(handler) {
  const h = (e) => handler(typeof e.detail === "boolean" ? e.detail : isKidMode());
  window.addEventListener(EVT, h);
  return () => window.removeEventListener(EVT, h);
}

// init once
(function init() {
  const on = isKidMode();
  document.body.classList.toggle("kid", on);
  document.body.dataset.childmode = on ? "1" : "0";
})();
