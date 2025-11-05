// client/src/pages/Learn.jsx
import { Link, useNavigate } from "react-router-dom";
import "@/styles/learn.css";
import "@/styles/kid/learn-kid.css";
import { useEffect, useMemo, useState } from "react";
import { getPercent } from "@/lib/progressStore";
import { getTotal } from "@/lib/learnData";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";

function Row({ slug, title, icon }) {
  const total = getTotal(slug);
  const pct = Math.max(0, Math.min(100, Math.round(getPercent(slug, total) ?? 0)));

  return (
    <div className="cont-card">
      <div className="cont-icon" aria-hidden>{icon || "📚"}</div>
      <div className="cont-body">
        <div className="cont-title">{title}</div>
        <div className="cont-sub">{pct}% complete</div>
        <div className="cont-progress"><div className="cont-bar" style={{ width: `${pct}%` }} /></div>
      </div>
      <Link className="cont-open" to={`/learn/${slug}`}>Open</Link>
    </div>
  );
}

export default function Learn() {
  const nav = useNavigate();

  // soft refresh triggers (same as before)
  const [nonce, setNonce] = useState(0);

  // modules from Firestore
  const [mods, setMods] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load published modules from Firestore
  useEffect(() => {
    (async () => {
      try {
        const q = query(
          collection(db, "modules"),
          where("status", "==", "published"),
          orderBy("title", "asc")
        );
        const snap = await getDocs(q);
        setMods(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("Failed to load modules:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // same soft-refresh listeners you already had
  useEffect(() => {
    const soft = () => setNonce(n => n + 1);
    const hard = () => { window.location.reload(); };

    window.addEventListener("app:progressReset", hard);
    window.addEventListener("focus", soft);
    const onVisible = () => { if (document.visibilityState === "visible") soft(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("app:progressReset", hard);
      window.removeEventListener("focus", soft);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Ongoing progress (0% < pct < 100%)
  const ongoing = useMemo(() => {
    return mods.filter(c => {
      const total = getTotal(c.slug);
      const pct = Math.max(0, Math.min(100, Math.round(getPercent(c.slug, total) ?? 0)));
      return pct > 0 && pct < 100;
    });
  }, [mods, nonce]);

  return (
    <div className="learn-page" data-nonce={nonce}>
      {/* Top bar */}
      <header className="learn-top">
        <div className="brand">
          <img className="brand-logo" src="/logo192.png" alt="" aria-hidden />
          <span className="brand-name">HandiTalk</span>
        </div>
        <button
          className="profile-btn"
          aria-label="Profile"
          onClick={() => nav("/profile")}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Z" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M3.5 20.5a8.5 8.5 0 0 1 17 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>
      </header>

      <main className="learn-main">
        <h1 className="learn-title">Learn Sign Language</h1>
        <p className="learn-sub">Choose a category to start learning</p>

        {/* Cards grid */}
        {loading ? (
          <p>Loading…</p>
        ) : mods.length === 0 ? (
          <p>No modules available yet.</p>
        ) : (
          <div className="cat-grid">
            {mods.map(m => (
              <Link
                key={`${m.slug}-${nonce}`}
                to={`/learn/${m.slug}`}
                className={`cat-card ${m.tone || ""}`} // pastel color class from Firestore
                title={m.title}
              >
                <div className="icon-bubble" aria-hidden>{m.icon || "📚"}</div>
                <div className="cat-label">{m.title}</div>
              </Link>
            ))}
          </div>
        )}

        {/* Continue section (only when ongoing exists) */}
        {!loading && ongoing.length > 0 && (
          <section className="continue">
            <h2 className="section-title">Continue Learning</h2>
            {ongoing.map(c => (
              <Row key={`${c.slug}-${nonce}`} slug={c.slug} title={c.title} icon={c.icon} />
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
