import { NavLink, Outlet } from "react-router-dom";
import { useEffect } from "react";

/* Icons */
const Icon = ({ d }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d={d}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function Tab({ to, d, label }) {
  return (
    <NavLink to={to} className={({ isActive }) => "tab" + (isActive ? " active" : "")}>
      <Icon d={d} />
      {label}
    </NavLink>
  );
}

/* Apply/remove body.kid only while this shell exists (i.e., after login) */
function KidBodyBridge() {
  useEffect(() => {
    const apply = (flag) => {
      const on =
        typeof flag === "boolean"
          ? flag
          : localStorage.getItem("app.childmode") === "1";
      document.body.classList.toggle("kid", on);
      document.body.dataset.childmode = on ? "1" : "0";
    };

    apply(); // on mount

    const onKid = (e) => apply(e.detail);
    window.addEventListener("app:childmode", onKid);

    return () => {
      window.removeEventListener("app:childmode", onKid);
      document.body.classList.remove("kid");
      document.body.dataset.childmode = "0";
    };
  }, []);

  return null;
}

export default function MobileLayout() {
  return (
    <div className="mobile-shell">
      <KidBodyBridge />

      <main className="mobile-main">
        <Outlet />
      </main>

      <nav className="tabbar" role="navigation" aria-label="Bottom navigation">
        <Tab to="/home" d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1v-10.5Z" label="Home" />
        <Tab to="/learn" d="M5 20h14M6 16h12M7 3h10l2 5H5l2-5Z" label="Learn" />
        <Tab to="/therapy" d="M8 7a4 4 0 1 1 8 0v1h1a3 3 0 1 1 0 6h-1v5H8v-5H7a3 3 0 1 1 0-6h1V7Z" label="Therapy" />
        <Tab to="/progress" d="M4 20V10m5 10V6m5 14V12m5 8V4" label="Progress" />
      </nav>
    </div>
  );
}
