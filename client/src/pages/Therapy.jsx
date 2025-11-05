import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "@/styles/therapy.css";
import "@/styles/kid/therapy-kid.css";

/* ---------- Storage keys ---------- */
const LS_GOAL = "therapy.goal.v1";
const LS_LAST = "therapy.last.v1";

const LS_DAY_UNIQUE = "therapy.day.unique.v1"; // { day, items[] }
const LS_COMPLETED  = "therapy.completed.v1";   // legacy sync
const LS_LAST_DAY   = "therapy.last_day.v2";    // legacy sync

const LS_MODE       = "therapy.mode.v1";        // "sentence" | "pronunciation"
const LS_MIC_STATUS = "therapy.mic.status.v1";

/* ---------- Helpers ---------- */
function getGoal() {
  const v = Number(localStorage.getItem(LS_GOAL));
  return Number.isFinite(v) && v > 0 ? v : 5;
}

function readUniqueCountToday() {
  const today = new Date().toDateString();
  let data;
  try { data = JSON.parse(localStorage.getItem(LS_DAY_UNIQUE) || "null"); }
  catch { data = null; }

  if (!data || data.day !== today) {
    const fresh = { day: today, items: [] };
    localStorage.setItem(LS_DAY_UNIQUE, JSON.stringify(fresh));
    localStorage.setItem(LS_COMPLETED, "0");
    localStorage.setItem(LS_LAST_DAY, today);
    return 0;
  }
  const count = Array.isArray(data.items) ? data.items.length : 0;
  localStorage.setItem(LS_COMPLETED, String(count));
  localStorage.setItem(LS_LAST_DAY, today);
  return count;
}

function getLast() {
  try { return JSON.parse(localStorage.getItem(LS_LAST) || "null"); }
  catch { return null; }
}

function getMode() {
  const v = localStorage.getItem(LS_MODE);
  return v === "pronunciation" ? "pronunciation" : "sentence";
}
function setMode(v) { localStorage.setItem(LS_MODE, v); }

function etaText(leftCount) {
  if (leftCount <= 0) return "Done for today";
  const min = Math.max(1, Math.ceil(leftCount / 2));
  return `~${min} min left`;
}

function GoalBar({ value = 0, max = 5 }) {
  const shown = Math.min(value, max);
  const pct = Math.max(0, Math.min(100, Math.round((max ? shown / max : 0) * 100)));
  const left = Math.max(0, max - shown);
  return (
    <div className="t-card t-goal">
      <div className="t-goal-head">
        <div className="t-goal-title">Daily Goal</div>
        <div className="t-goal-count">{shown} / {max}</div>
      </div>
      <div className="t-goal-bar">
        <div className="t-goal-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="t-goal-sub">
        {pct === 100 ? "100% of today’s goal" : `${pct}% of today’s goal • ${etaText(left)}`}
      </div>
    </div>
  );
}

/* ---------- Mode metadata ---------- */
const MODE_META = {
  pronunciation: { key: "pronunciation", name: "Words", emoji: "🔤", desc: "Target words drill" }, // ← renamed
  sentence:      { key: "sentence",      name: "Sentence", emoji: "📝", desc: "Word-by-word scoring" },
};

export default function Therapy() {
  const goal = getGoal();
  const [completed, setCompleted] = useState(readUniqueCountToday());
  const last = getLast();

  useEffect(() => {
    const refresh = () => setCompleted(readUniqueCountToday());
    window.addEventListener("focus", refresh);
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);

    const onReset = () => setCompleted(0);
    window.addEventListener("app:progressReset", onReset);

    refresh();
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("app:progressReset", onReset);
    };
  }, []);

  const [mode, setModeState] = useState(getMode());
  const [showHow, setShowHow] = useState(false);
  const micStatus = localStorage.getItem(LS_MIC_STATUS);

  const encouragement =
    completed >= goal ? "Amazing work!"
    : completed >= Math.ceil(goal/2) ? "Nice! You’re halfway there"
    : "You’ve got this!";

  const onStart = () => setMode(mode);
  const onSelectMode = (mkey) => { setModeState(mkey); localStorage.setItem(LS_MODE, mkey); };

  return (
    <div className="therapy-page">
      <header className="learn-top">
        <div className="brand">
          <img className="brand-logo" src="/logo192.png" alt="" aria-hidden />
          <span className="brand-name">HandiTalk</span>
        </div>
        <Link to="/profile" className="profile-btn" aria-label="Profile">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Z" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M3.5 20.5a8.5 8.5 0 0 1 17 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </Link>
      </header>

      <main className="therapy-main calm altbg">
        <section className="t-titlecard">
          <h1 className="t-title">Speech Therapy Practice</h1>
          <p className="t-sub">Choose a mode and start speaking.</p>
        </section>

        <div className="t-stack">
          <GoalBar value={completed} max={goal} />

          <section className="t-setup bare">
            <div className="t-row-head">
              <div className="t-row-title">Mode</div>
              <button className="icon-btn" onClick={() => setShowHow(true)} aria-label="How scoring works">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6"/>
                  <circle cx="12" cy="12" r="5.5" stroke="currentColor" strokeWidth="1.6" opacity=".9"/>
                  <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6"/>
                  <path d="M15.5 8.5 20 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  <path d="M19 5l.5-2 2-.5-.5 2-2 .5Z" fill="currentColor"/>
                </svg>
              </button>
            </div>

            <div className="t-mode-grid two">
              {["pronunciation", "sentence"].map((k) => {
                const m = MODE_META[k];
                const active = m.key === mode;
                return (
                  <button
                    key={m.key}
                    className={`t-mode-btn ${active ? "on" : ""}`}
                    onClick={() => onSelectMode(m.key)}
                    aria-pressed={active}
                  >
                    <div className="t-mode-ico" aria-hidden>{m.emoji}</div>
                    <div className="t-mode-name">{m.name}</div>
                    <div className="t-mode-desc">{m.desc}</div>
                  </button>
                );
              })}
            </div>

            <div className="t-banner">
              <div className="t-banner-ico" aria-hidden>✨</div>
              <div className="t-banner-text">
                <div className="t-banner-title">{encouragement}</div>
                <div className="t-banner-sub">
                  {completed >= goal ? "Daily goal complete 🎉" : "Stay consistent to build fluency."}
                </div>
              </div>
            </div>

            <Link to="/therapy/practice" className="t-cta big" onClick={onStart}>
              {completed >= goal ? "Continue practice" : "Start practice"}
            </Link>
          </section>

          <section className="t-card t-last-card">
            <div className="t-last-head">
              <div className="t-last-title">Last Practice</div>
              {last?.accuracy != null && (
                <span className="t-badge">{last.accuracy >= 70 ? "Keep going! 💪" : "You’re improving!"}</span>
              )}
            </div>
            <div className="t-last-grid">
              <div className="kv">
                <span>Fluency</span>
                <b className="chip">
                  {last?.fluency || (last?.accuracy != null
                    ? (last.accuracy >= 85 ? "Excellent" : last.accuracy >= 70 ? "Good" : "Fair")
                    : "—")}
                </b>
              </div>
              <div className="kv">
                <span>Date</span>
                <b>{last?.dateISO ? new Date(last.dateISO).toLocaleDateString() : "—"}</b>
              </div>
            </div>
            <Link to="/progress" className="t-ghost">See details →</Link>
          </section>
        </div>

        {localStorage.getItem(LS_MIC_STATUS) && (
          <div className="t-mic-note">
            <div className={`dot ${localStorage.getItem(LS_MIC_STATUS)}`} aria-hidden />
            {localStorage.getItem(LS_MIC_STATUS) === "good" && "Mic level looks good."}
            {localStorage.getItem(LS_MIC_STATUS) === "quiet" && "Mic seems quiet — hold the phone closer or speak a bit louder."}
            {localStorage.getItem(LS_MIC_STATUS) === "noisy" && "Background noise detected — try a quieter space for better accuracy."}
          </div>
        )}
      </main>

      {showHow && (
        <div className="t-sheet" role="dialog" aria-modal="true">
          <div className="t-sheet-card">
            <div className="t-sheet-head">
              <div className="t-sheet-title">How scoring works</div>
              <button className="t-x" onClick={() => setShowHow(false)} aria-label="Close">✕</button>
            </div>
            <div className="t-sheet-body">
              <p>We transcribe your speech in-browser, align it to the target sentence, and score each word.</p>
              <ul className="t-ul">
                <li><b>Green</b> — good match</li>
                <li><b>Yellow</b> — close pronunciation</li>
                <li><b>Red</b> — wrong or missed</li>
              </ul>
              <p>We weigh <b>content words</b> more than filler words so your score reflects clarity of the key parts.</p>
            </div>
            <div className="t-sheet-actions">
              <button className="t-pill" onClick={() => setShowHow(false)}>Got it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
