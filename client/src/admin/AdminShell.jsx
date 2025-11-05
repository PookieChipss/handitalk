// client/src/admin/AdminShell.jsx
import { Link, Outlet, useLocation } from "react-router-dom";
import { getAuth, signOut } from "firebase/auth";

/** Small icon-only logout button in the TopBar */
function TopBar() {
  async function onLogout() {
    const ok = window.confirm("Log out of the admin dashboard?");
    if (!ok) return;
    try {
      await signOut(getAuth());
      window.location.href = "/login";
    } catch (e) {
      console.error("signOut error:", e);
      alert("Failed to log out. Please try again.");
    }
  }

  return (
    <div
      style={{
        height: 56,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        background: "#fff",
        borderBottom: "1px solid #eee",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div style={{ fontWeight: 700 }}>HandiTalk</div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ opacity: 0.7, fontSize: 14 }}>Admin</span>

        {/* Icon-only logout button */}
        <button
          onClick={onLogout}
          aria-label="Log out"
          title="Log out"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            height: 36,
            width: 44,
            borderRadius: 12,
            border: "none",
            background: "#0f1d33",      // same dark pill as your primary buttons
            color: "#fff",
            cursor: "pointer",
            boxShadow: "0 6px 16px rgba(15,29,51,.25)",
          }}
        >
          {/* door with arrow icon */}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3" />
            <path d="M15 17l5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function AdminTabs() {
  const { pathname } = useLocation();
  const Tab = ({ to, label }) => {
    const active = pathname.startsWith(to);
    return (
      <Link
        to={to}
        style={{
          flex: 1,
          textAlign: "center",
          padding: "8px 6px",
          fontWeight: active ? 700 : 500,
          opacity: active ? 1 : 0.65,
          textDecoration: "none",
          color: "inherit",
        }}
      >
        {label}
      </Link>
    );
  };
  return (
    <div
      style={{
        position: "sticky",
        bottom: 0,
        zIndex: 10,
        height: 56,
        display: "flex",
        alignItems: "center",
        background: "#fff",
        borderTop: "1px solid #eee",
      }}
    >
      <Tab to="/admin/modules" label="Modules" />
      <Tab to="/admin/content" label="Content" />
      <Tab to="/admin/users" label="Users" />
    </div>
  );
}

export default function AdminShell() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#f6f7fb",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <TopBar />
      <div style={{ flex: 1, padding: 16 }}>
        <Outlet />
      </div>
      <AdminTabs />
    </div>
  );
}
