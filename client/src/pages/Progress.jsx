import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "@/styles/progress.css";
import "@/styles/kid/progress-kid.css";
import { itemIsDone, categoryPercent } from "@/lib/progressStore";
import { getTotal } from "@/lib/learnData";

/* LS keys */
const LS_STREAK   = "therapy.streak.v1";
const LS_GOAL     = "therapy.goal.v1";
const LS_HISTORY  = "therapy.history.v1";

const CATS = [
  { slug: "alphabet",  title: "Alphabet",   icon: "🔤" },
  { slug: "numbers",   title: "Numbers",    icon: "🔢" },
  { slug: "phrases",   title: "Phrases",    icon: "🤟" },
  { slug: "emotions",  title: "Emotions",   icon: "🙂" },
  { slug: "greetings", title: "Greetings",  icon: "👋" },
  { slug: "foods",     title: "Foods",      icon: "🥗" },
];

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || ""); } catch { return fallback; }
}
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export default function Progress() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick(t => t + 1);
    window.addEventListener("app:progressReset", bump);
    window.addEventListener("focus", bump);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") bump();
    });
    return () => {
      window.removeEventListener("app:progressReset", bump);
      window.removeEventListener("focus", bump);
    };
  }, []);

  /* ---------- Learn stats ---------- */
  const learnStats = useMemo(() => {
    let signsLearned = 0;
    let modulesCompleted = 0;
    let best = null;

    for (const c of CATS) {
      const total = getTotal(c.slug) || 0;
      if (total <= 0) continue;

      for (let i = 0; i < total; i++) if (itemIsDone(c.slug, i)) signsLearned++;

      const pct = Math.round(categoryPercent(c.slug, total));
      if (pct >= 100) modulesCompleted++;
      if (pct > 0 && pct < 100) {
        if (!best || pct > best.pct) best = { ...c, pct };
      }
    }
    return { signsLearned, modulesCompleted, recentCat: best };
  }, [tick]);

  /* ---------- Therapy stats ---------- */
  const history = readJSON(LS_HISTORY, []) || [];
  const latestTherapy = history.length ? history[history.length - 1] : null;

  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const startOfWeek = Date.now() - weekMs;
  const week = history.filter(h => {
    const t = Date.parse(h?.dateISO || "");
    return Number.isFinite(t) && t >= startOfWeek;
  });
  const totalSec = week.reduce((s, h) => s + (Number(h.durationSec) || 0), 0);
  const practicedMin = Math.round(totalSec / 60);
  const avgAcc = week.length
    ? Math.round(week.reduce((s, h) => s + (Number(h.accuracy) || 0), 0) / week.length)
    : null;

  const WEEKLY_TARGET_MIN = 70;
  const ringPct = clamp(Math.round((practicedMin / WEEKLY_TARGET_MIN) * 100), 0, 100);

  const streak = Number(localStorage.getItem(LS_STREAK) || 0) || 0;
  const dailyGoal = Number(localStorage.getItem(LS_GOAL) || 5) || 5;

  return (
    <div className="prog-page" data-tick={tick}>
      <header className="learn-top">
        <div className="brand">
          <img className="brand-logo" src="/logo192.png" alt="HandiTalk logo" />
        <span className="brand-name">HandiTalk</span>
        </div>

        <Link to="/profile" className="profile-btn" aria-label="Profile">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Z" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M3.5 20.5a8.5 8.5 0 0 1 17 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </Link>
      </header>

      <main className="prog-main mobile-fit">
        <h1 className="prog-title">Progress</h1>
        <p className="prog-sub">Your recent activity and stats.</p>

        {/* ===================== LEARN PROGRESS ===================== */}
        <h2 className="section-label">Learn Progress</h2>

        <section className="kpi-row" aria-label="Learn KPIs">
          <div className="kpi">
            <div className="kpi-ico" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M2 9.5 12 5l10 4.5-10 4.5L2 9.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M6 12.5V16c2 1.6 4 2.4 6 2.4S16 17.6 18 16v-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="kpi-num">{learnStats.signsLearned}</div>
            <div className="kpi-label">Signs learned</div>
          </div>

          <div className="kpi">
            <div className="kpi-ico" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 3l2.2 3.8 4.3.8-3 3.2.6 4.4L12 13.8 7.9 15.2l.6-4.4-3-3.2 4.3-.8L12 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="kpi-num">{learnStats.modulesCompleted}</div>
            <div className="kpi-label">Modules completed</div>
          </div>

          <div className="kpi">
            <div className="kpi-ico" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 12m-7 0a7 7 0 1 0 14 0 7 7 0 1 0-14 0" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M12 7v5l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="kpi-num">{streak}</div>
            <div className="kpi-label">Day streak</div>
          </div>
        </section>

        <section className="list-card" aria-label="Recent learn">
          <div className="list-head">Recent Learn</div>
          {!learnStats.recentCat ? (
            <Link to="/learn" className="row-btn">
              <div className="row-leading"><div className="row-emoji">📚</div></div>
              <div className="row-main">
                <div className="row-title">Start learning</div>
                <div className="row-sub">Pick a category</div>
              </div>
              <div className="row-chev">›</div>
            </Link>
          ) : (
            <Link to={`/learn/${learnStats.recentCat.slug}`} className="row-btn">
              <div className="row-leading">
                <div className="row-emoji" aria-hidden>{learnStats.recentCat.icon}</div>
              </div>
              <div className="row-main">
                <div className="row-title">{learnStats.recentCat.title}</div>
                <div className="row-bar"><i style={{width:`${learnStats.recentCat.pct}%`}}/></div>
              </div>
              <div className="row-meta">{learnStats.recentCat.pct}%</div>
              <div className="row-chev" aria-hidden>›</div>
            </Link>
          )}
        </section>

        {/* ===================== THERAPY PROGRESS ===================== */}
        <h2 className="section-label">Therapy Progress</h2>

        <section className="card" aria-label="Weekly speech practice">
          <div className="card-title-row">
            <div className="card-title">Weekly Speech Practice</div>
            <div className="goal-chip">{dailyGoal} / day</div>
          </div>

          <div className="wp-grid">
            <div className="ring" style={{"--pct": `${ringPct}%`}}>
              <div className="ring-center"><b>{ringPct}%</b></div>
            </div>

            <div className="mini-col">
              <div className="mini">
                <div className="mini-ico" aria-hidden>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M9 2h6M12 2v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                    <circle cx="12" cy="14" r="7" stroke="currentColor" strokeWidth="1.6"/>
                    <path d="M12 14l3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="mini-title">Practice time</div>
                <div className="mini-sub">{practicedMin || 0} min</div>
              </div>

              <div className="mini">
                <div className="mini-ico" aria-hidden>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M5 19V9M12 19V5M19 19v-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="mini-title">Average accuracy</div>
                <div className="mini-sub">{avgAcc == null ? "—" : `${avgAcc}%`}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="list-card" aria-label="Recent therapy">
          <div className="list-head">Recent Therapy</div>
          {!latestTherapy ? (
            <div className="empty">No sessions yet.</div>
          ) : (
            <Link to="/therapy" className="row-btn">
              <div className="row-leading">
                <div className="row-emoji" aria-hidden>🎤</div>
              </div>
              <div className="row-main">
                <div className="row-title clamp1">
                  {latestTherapy.target || "(target)"}
                </div>
                <div className="row-sub">
                  {new Date(latestTherapy.dateISO || Date.now()).toLocaleString()} · {latestTherapy.level || "—"} · {latestTherapy.mode === "sentence" ? "Sentence" : "Word"}
                </div>
              </div>
              <div className="row-meta">{Math.round(latestTherapy.accuracy || 0)}%</div>
              <div className="row-chev" aria-hidden>›</div>
            </Link>
          )}
        </section>
      </main>
    </div>
  );
}
