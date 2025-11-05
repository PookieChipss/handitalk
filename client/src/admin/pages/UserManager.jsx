import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import "@/admin/styles/admin-users.css";

// Add guaranteed admins here if your users collection doesn't store roles:
const FALLBACK_ADMIN_EMAILS = ["handitalk.project@gmail.com"];
const FALLBACK_ADMIN_UIDS   = []; // e.g. ["5JLhnRbpt6WlyeNeKvOmng8f1rP2"]

function truthy(v) {
  return v === true || v === "true" || v === 1 || v === "1";
}

function getRoleLabel(u) {
  // 1) fields that might exist in your users doc
  if (truthy(u?.roles?.admin)) return "Admin";
  if (truthy(u?.customClaims?.admin)) return "Admin";
  if (truthy(u?.isAdmin)) return "Admin";
  if (String(u?.role || "").toLowerCase() === "admin") return "Admin";

  // 2) fallbacks by email/uid
  const email = String(u?.email || "").toLowerCase();
  const uid = String(u?.uid || u?.id || "");
  if (email && FALLBACK_ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email)) return "Admin";
  if (uid && FALLBACK_ADMIN_UIDS.includes(uid)) return "Admin";

  return "User";
}

export default function UserManager() {
  const [users, setUsers] = useState([]);
  const [qtext, setQtext] = useState("");
  const [err, setErr] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveFormat, setSaveFormat] = useState("csv");
  const [saveName, setSaveName] = useState(() => {
    const dt = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    return `users-${dt}`;
  });

  useEffect(() => {
    const qy = query(collection(db, "users"), orderBy("email", "asc"));
    return onSnapshot(
      qy,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Debug: show what roles we think each row is
        rows.forEach((u) => {
          const label = getRoleLabel(u);
          // eslint-disable-next-line no-console
          console.debug("[UserManager] role", { email: u.email, uid: u.uid || u.id, label, raw: u });
        });
        setUsers(rows);
      },
      (e) => setErr(`Load failed: ${e?.message || "error"}`)
    );
  }, []);

  const filteredSorted = useMemo(() => {
    const s = qtext.trim().toLowerCase();
    let arr = users;
    if (s) {
      arr = users.filter(
        (u) =>
          (u.displayName || "").toLowerCase().includes(s) ||
          (u.email || "").toLowerCase().includes(s) ||
          (u.uid || u.id || "").toLowerCase().includes(s)
      );
    }
    return [...arr].sort((a, b) => {
      const aAdmin = getRoleLabel(a) === "Admin";
      const bAdmin = getRoleLabel(b) === "Admin";
      if (aAdmin !== bAdmin) return aAdmin ? -1 : 1;
      const ae = (a.email || "").toLowerCase();
      const be = (b.email || "").toLowerCase();
      return ae.localeCompare(be);
    });
  }, [users, qtext]);

  // Save helpers
  function toCsv(rows) {
    return rows
      .map((r) =>
        r
          .map((cell) => {
            const s = String(cell ?? "");
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(",")
      )
      .join("\n");
  }
  function download(filename, mime, content) {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  function onSave() {
    try {
      const data = filteredSorted.map((u) => ({
        name: u.displayName || "",
        email: u.email || "",
        uid: u.uid || u.id || "",
        role: getRoleLabel(u),
      }));
      if (saveFormat === "json") {
        download(`${saveName || "users"}.json`, "application/json", JSON.stringify(data, null, 2));
      } else {
        const rows = [["Name", "Email", "UID", "Role"], ...data.map((d) => [d.name, d.email, d.uid, d.role])];
        download(`${saveName || "users"}.csv`, "text/csv", toCsv(rows));
      }
      setSaveOpen(false);
    } catch (e) {
      setErr(`Save failed: ${e?.message || "error"}`);
    }
  }

  return (
    <div className="umx">
      <header className="umx-head">
        <div>
          <h2>User Manager</h2>
          <p>All accounts (mirrored from Firebase Auth). Admin status is read-only.</p>
        </div>
        <div className="grow" />
        <input
          className="inp"
          placeholder="Search name/email/uid…"
          value={qtext}
          onChange={(e) => setQtext(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <button className="btn" onClick={() => setSaveOpen(true)} style={{ marginLeft: 8 }}>
          Save As
        </button>
      </header>

      {err && <div className="alert" style={{ marginBottom: 12 }}>{err}</div>}

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: "26%" }}>Name</th>
              <th>Email</th>
              <th>UID</th>
              <th className="th-role">Role</th>
            </tr>
          </thead>
          <tbody>
            {filteredSorted.map((u) => {
              const roleLabel = getRoleLabel(u);
              const isAdmin = roleLabel === "Admin";
              return (
                <tr key={u.id} className={isAdmin ? "row-admin" : undefined}>
                  <td>
                    <div className="name-wrap">
                      {isAdmin && <span className="i-lock" aria-hidden>🔒</span>}
                      <span className="name">{u.displayName || "—"}</span>
                    </div>
                  </td>
                  <td className="mono">{u.email || "—"}</td>
                  <td className="mono small">{u.uid || u.id}</td>

                  {/* ROLE: render as plain text with inline styles (can’t be hidden by CSS) */}
                  <td className="col-role">
                    <span
                      data-role={roleLabel}
                      style={{
                        fontWeight: 700,
                        fontSize: 13,
                        letterSpacing: 0.2,
                        color: isAdmin ? "#7a5a00" : "#111827",
                        background: isAdmin ? "#fff1cd" : "transparent",
                        border: isAdmin ? "1px solid #f5d98a" : "1px solid transparent",
                        borderRadius: 999,
                        padding: "2px 10px",
                        display: "inline-block",
                        lineHeight: "22px",
                        minHeight: 22,
                        userSelect: "text",
                      }}
                    >
                      {roleLabel}
                    </span>
                  </td>
                </tr>
              );
            })}
            {filteredSorted.length === 0 && (
              <tr>
                <td colSpan={4} className="muted center">No users found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {saveOpen && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Save export">
          <div className="modal-card">
            <h3>Save As</h3>
            <div className="form">
              <label>Filename (without extension)</label>
              <input
                className="inp"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="users-YYYY-MM-DD"
              />
              <label style={{ marginTop: 10 }}>Format</label>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                  <input type="radio" name="fmt" checked={saveFormat === "csv"} onChange={() => setSaveFormat("csv")} />
                  <span>CSV</span>
                </label>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                  <input type="radio" name="fmt" checked={saveFormat === "json"} onChange={() => setSaveFormat("json")} />
                  <span>JSON</span>
                </label>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setSaveOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={onSave}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
