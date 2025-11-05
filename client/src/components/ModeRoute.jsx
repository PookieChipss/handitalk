// src/components/ModeRoute.jsx
import { useEffect, useSyncExternalStore } from "react";

const LS_KID = "app.childmode";

// subscribe to child-mode changes without reloading
function subscribe(cb) {
  const handler = (e) => cb();
  window.addEventListener("app:childmode", handler);
  return () => window.removeEventListener("app:childmode", handler);
}
function getSnapshot() {
  return localStorage.getItem(LS_KID) === "1";
}

export default function ModeRoute({ adult: Adult, child: Child }) {
  const kidOn = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const Comp = kidOn && Child ? Child : Adult;
  return <Comp />;
}
