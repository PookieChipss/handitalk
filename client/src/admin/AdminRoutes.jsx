import { NavLink, Navigate, Outlet, Route, Routes } from "react-router-dom";
import AdminErrorBoundary from "./AdminErrorBoundary.jsx";
import AdminGate from "@/admin/AdminGate.jsx";

// Admin pages
import ModulesManager from "@/admin/pages/ModulesManager.jsx";
import ContentManager from "@/admin/pages/ContentManager.jsx";
import UsersManager from "@/admin/pages/UsersManager.jsx";
import ModelManager from "@/admin/pages/ModelManager.jsx";

/** Simple shell with header + tabbed nav. Renders nested routes via <Outlet/>. */
function AdminShell() {
  const navStyle = ({ isActive }) => ({
    padding: "10px 14px",
    borderRadius: 8,
    textDecoration: "none",
    fontWeight: 600,
    background: isActive ? "#efeff6" : "transparent",
    color: "#1A1E2E",
  });

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", background: "#fff", minHeight: "100vh" }}>
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderBottom: "1px solid #e6e6ef",
          position: "sticky",
          top: 0,
          background: "#fff",
          zIndex: 10,
        }}
      >
        <strong>HandiTalk</strong>
        <span style={{ color: "#6B7280" }}>Admin</span>
      </div>

      {/* Content */}
      <div style={{ padding: "16px" }}>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Admin Panel</h2>
        <p style={{ marginTop: 0, color: "#6B7280" }}>Manage modules, content, users, and models.</p>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: 6,
            border: "1px solid #e6e6ef",
            borderRadius: 10,
            background: "#fafafe",
            marginBottom: 16,
          }}
        >
          <NavLink to="modules" style={navStyle} end>
            Modules
          </NavLink>
          <NavLink to="content" style={navStyle} end>
            Content
          </NavLink>
          <NavLink to="users" style={navStyle} end>
            Users
          </NavLink>
          <NavLink to="models" style={navStyle} end>
            Models
          </NavLink>
        </div>

        {/* Nested page */}
        <Outlet />
      </div>
    </div>
  );
}

export default function AdminRoutes() {
  return (
    <AdminErrorBoundary>
      <Routes>
        {/* All admin routes live under /admin/* */}
        <Route
          path="/admin/*"
          element={
            <AdminGate>
              <AdminShell />
            </AdminGate>
          }
        >
          {/* /admin → /admin/modules */}
          <Route index element={<Navigate to="modules" replace />} />

          {/* Pages */}
          <Route path="modules" element={<ModulesManager />} />
          <Route path="content" element={<ContentManager />} />
          <Route path="users" element={<UsersManager />} />
          <Route path="models" element={<ModelManager />} />

          {/* Fallback within /admin */}
          <Route path="*" element={<Navigate to="modules" replace />} />
        </Route>

        {/* Safety net if someone hits these absolute paths directly (optional) */}
        <Route path="/admin" element={<Navigate to="/admin/modules" replace />} />
      </Routes>
    </AdminErrorBoundary>
  );
}
