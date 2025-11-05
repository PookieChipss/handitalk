// client/src/pages/SignToText.jsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./sign-to-text.css";
import "@/styles/kid/sign-to-text-kid.css";
import * as Detector from "../lib/detector"; // fingerspelling
import PhrasesDetectorFactory from "@/lib/phrases_detector_tflite"; // phrases (separate)

// ── timing & thresholds ─────────────────────────────────────────────────────────
const AUTO_INTERVAL_MS = 3000;     // commit cadence for auto mode (exact 3s)
const SNAP_GRACE_MS   = 120;       // must have a prediction within 120ms of the tick
const CMD_STABLE       = 6;        // frames to confirm space/backspace (free mode)
const CMD_COOLDOWN     = 12;       // cooldown frames after applying a command

// Confidence gates:
const CONF_SPELL_MIN  = 0.50;      // ≥ 50% for alphabets/digits
const CONF_PHRASE_MIN = 0.20;      // ≥ 20% for phrases

// ── helpers ────────────────────────────────────────────────────────────────────
function mapLabelToChar(lbl) {
  if (!lbl) return null;
  const t = String(lbl).trim();
  if (t.length === 1 && /[A-Za-z0-9]/.test(t)) return t.toUpperCase();
  const m = t.toUpperCase();
  if (m === "SPACE") return " ";
  if (m === "DEL" || m === "DELETE" || m === "BACKSPACE") return "<BKSP>";
  return null;
}

export default function SignToText() {
  const nav = useNavigate();
  const isKid =
    typeof document !== "undefined" &&
    document.body.classList.contains("kid");

  // UI state
  const [activeTab, setActiveTab] = useState("spelling"); // "spelling" | "phrases"
  const [mode, setMode]       = useState("free");         // "free" | "auto"
  const [running, setRunning] = useState(false);
  const [status, setStatus]   = useState("idle");
  const [mirror, setMirror]   = useState(true);
  const [hands, setHands]     = useState(0);
  const [text, setText]       = useState("");

  // chip shown on the video
  const [chip, setChip] = useState({ label: "", conf: 0 });

  // DOM refs
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const detRef    = useRef(null);
  const rafRef    = useRef(0);

  // internal rolling state
  const stRef = useRef({
    // majority (free spelling)
    letterBuf: [],

    // exact-snapshot latest predictions for both tabs
    lastSpell: { v: null, conf: 0, t: 0 },   // {v: 'A', conf: 0.93, t: now}
    lastPhrase:{ v: null, conf: 0, t: 0 },

    // auto timer
    flushTimer: null,
    nextFlushAt: 0,

    // space/backspace debouncer (free mode)
    cmdCurr: null,
    cmdCount: 0,
    cmdCooldown: 0,

    // hand presence (for exact snapshot gating)
    hands: 0,

    // stream cleanup
    tracks: [],
    streams: [],
  });

  // keep hands in ref for exact tick checks
  const onHandsChange = (n) => {
    setHands(n ?? 0);
    stRef.current.hands = n ?? 0;
  };

  // ── text helpers ─────────────────────────────────────────────────────────────
  const appendChar = (ch) => {
    if (!ch) return;
    if (ch === "<BKSP>") { setText((t) => t.slice(0, -1)); return; }
    setText((t) => t + ch);
  };
  const space     = () => setText((t) => t + " ");
  const backspace = () => setText((t) => t.slice(0, -1));
  const clearText = () => setText("");

  // ── prediction handler (single place that receives both pipelines) ───────────
  const handlePredict = (out) => {
    let label, conf, ch;

    if (typeof out === "string") { label = out; conf = 1; }
    else if (out && typeof out === "object") {
      label = out.label ?? out.pred ?? out.class ?? "";
      conf  = Number(out.conf ?? out.confidence ?? 0);
      ch    = out.char ?? out.character ?? null;
    } else { label = ""; conf = 0; }

    if (!ch) ch = mapLabelToChar(label);

    // gate confidences per-tab for chip only
    const minConf = activeTab === "phrases" ? CONF_PHRASE_MIN : CONF_SPELL_MIN;
    const okConf  = conf >= minConf;
    setChip(okConf && label ? { label, conf } : { label: "", conf: 0 });

    const S = stRef.current;
    const now = Date.now();

    // ── Spelling path
    if (activeTab === "spelling") {
      const letter = ch && ch.length === 1 && /[A-Z0-9]/.test(ch) ? ch : null;

      // Free mode: keep rolling buffer when ≥ 50%
      if (letter && conf >= CONF_SPELL_MIN) {
        S.letterBuf.push(letter);
        if (S.letterBuf.length > 30) S.letterBuf.shift();
      }

      // Exact snapshot: remember latest confident letter (for auto)
      if (letter && conf >= CONF_SPELL_MIN) {
        S.lastSpell = { v: letter, conf, t: now };
      } else if (ch === " " || ch === "<BKSP>") {
        // Remember commands too in case you want them in auto later; but we only act in free mode.
        // Do NOT set lastSpell to command; keep last letter-only behavior.
      }

      // Space/Backspace debouncer (free mode only)
      if (mode === "free") {
        if (conf >= CONF_SPELL_MIN && (ch === " " || ch === "<BKSP>")) {
          S.cmdCurr === ch ? S.cmdCount++ : (S.cmdCurr = ch, S.cmdCount = 1);
          if (S.cmdCooldown > 0) S.cmdCooldown--;
          if (S.cmdCount >= CMD_STABLE && S.cmdCooldown === 0) {
            if (ch === " ") space(); else backspace();
            S.cmdCooldown = CMD_COOLDOWN;
            S.cmdCount = 0;
          }
        } else {
          S.cmdCurr = null;
          if (S.cmdCooldown > 0) S.cmdCooldown--;
          S.cmdCount = 0;
        }
      }

    // ── Phrases path
    } else {
      // Exact snapshot: remember latest confident phrase (for auto)
      if (label && conf >= CONF_PHRASE_MIN) {
        S.lastPhrase = { v: String(label), conf, t: now };
      }
      // (Free mode intentionally doesn't type phrases)
    }
  };

  // ── majority for free mode (spelling) ────────────────────────────────────────
  const pickMajorityLetter = () => {
    const arr = stRef.current.letterBuf;
    if (!arr.length) return null;
    const counts = new Map();
    for (const c of arr) counts.set(c, (counts.get(c) || 0) + 1);
    let best = null, bestN = -1;
    for (const [c, n] of counts) { if (n > bestN) { best = c; bestN = n; } }
    return best;
  };

  // ── auto timer using EXACT snapshot ──────────────────────────────────────────
  const [countdown, setCountdown] = useState(3);

  const startAutoTimer = () => {
    clearInterval(stRef.current.flushTimer);
    stRef.current.nextFlushAt = Date.now() + AUTO_INTERVAL_MS;

    stRef.current.flushTimer = setInterval(() => {
      const S = stRef.current;
      const now = Date.now();

      // require a hand at the tick
      const handPresent = (S.hands || 0) > 0;

      if (activeTab === "spelling") {
        const ls = S.lastSpell;
        const fresh = ls && (now - ls.t) <= SNAP_GRACE_MS;
        if (handPresent && fresh && ls.v) {
          appendChar(ls.v);
        }
        // reset majority bag to avoid carry-over effects
        S.letterBuf = [];
      } else {
        const lp = S.lastPhrase;
        const fresh = lp && (now - lp.t) <= SNAP_GRACE_MS;
        if (handPresent && fresh && lp.v) {
          // append phrase word + space
          setText((t) => (t ? `${t}${t.endsWith(" ") ? "" : " "}${lp.v}` : lp.v));
        }
      }

      // schedule next exact tick
      stRef.current.nextFlushAt = Date.now() + AUTO_INTERVAL_MS;
    }, AUTO_INTERVAL_MS);
  };

  const stopAutoTimer = () => {
    clearInterval(stRef.current.flushTimer);
    stRef.current.flushTimer = null;
    stRef.current.nextFlushAt = 0;
  };

  useEffect(() => {
    if (!running || mode !== "auto") { setCountdown(3); return; }
    const t = setInterval(() => {
      const ms = Math.max(0, stRef.current.nextFlushAt - Date.now());
      setCountdown(Math.max(1, Math.ceil(ms / 1000)));
    }, 200);
    return () => clearInterval(t);
  }, [mode, running]);

  // ── camera/streams lifecycle ─────────────────────────────────────────────────
  function rememberActiveStream(videoEl, det) {
    const store = stRef.current;
    store.tracks = store.tracks || [];
    store.streams = store.streams || [];

    const pushStream = (s) => {
      if (s && !store.streams.includes(s)) {
        store.streams.push(s);
        (s.getTracks?.() || []).forEach(t => {
          if (t && !store.tracks.includes(t)) store.tracks.push(t);
        });
      }
    };

    const vs = videoEl?.srcObject;
    if (vs) pushStream(vs);
    try { if (det?.stream) pushStream(det.stream); } catch {}
    try { if (det?.camera?.stream) pushStream(det.camera.stream); } catch {}
    try { if (det?.camera?.video?.srcObject) pushStream(det.camera.video.srcObject); } catch {}
    try { if (det?.video?.srcObject) pushStream(det.video.srcObject); } catch {}
  }

  async function stopEverything(det, videoEl, canvasEl) {
    try { await det?.stopAll?.(); } catch {}
    try { await det?.stop?.(); } catch {}
    try { await det?.close?.(); } catch {}
    try { await det?.destroy?.(); } catch {}
    try { await det?.camera?.stop?.(); } catch {}
    try { await det?.hands?.close?.(); } catch {}

    if (rafRef.current) { try { cancelAnimationFrame(rafRef.current); } catch {} rafRef.current = 0; }

    const store = stRef.current;
    (store.tracks || []).forEach(t => { try { t.stop(); } catch {} });
    store.tracks = [];

    const so = videoEl?.srcObject;
    if (so?.getTracks) { try { so.getTracks().forEach(t => t.stop()); } catch {} }

    if (videoEl) {
      try { videoEl.pause(); } catch {}
      try { videoEl.srcObject = null; } catch {}
      try { videoEl.removeAttribute?.("srcObject"); } catch {}
      try { videoEl.load(); } catch {}
      videoEl.style.transform = "none";
    }

    const ctx = canvasEl?.getContext?.("2d");
    if (ctx && canvasEl) ctx.clearRect(0, 0, canvasEl.width || 0, canvasEl.height || 0);
    setChip({ label: "", conf: 0 });

    stopAutoTimer();

    // clear state
    store.letterBuf = [];
    store.lastSpell  = { v: null, conf: 0, t: 0 };
    store.lastPhrase = { v: null, conf: 0, t: 0 };
    store.cmdCurr = null;
    store.cmdCount = 0;
    store.cmdCooldown = 0;
  }

  async function start() {
    if (!videoRef.current || !canvasRef.current) return;
    setStatus("starting…");
    try {
      const opts = {
        video:  videoRef.current,
        canvas: canvasRef.current,
        mirror,
        onHands: onHandsChange,
        onPredict: handlePredict,
        setRAF: (id) => { rafRef.current = id; },
      };

      const factory =
        activeTab === "phrases"
          ? PhrasesDetectorFactory
          : (Detector.createDetector || Detector.default || Detector);

      if (typeof factory !== "function") throw new Error("detector export is not a function");
      const det = await Promise.resolve(factory(opts));
      detRef.current = det;

      videoRef.current.style.transform = mirror ? "scaleX(-1)" : "none";

      if (det.startAll)         await det.startAll(videoRef.current, canvasRef.current, opts);
      else if (det.start)       await det.start();
      else if (det.run)         await det.run();
      else if (det.startCamera) await det.startCamera();
      else throw new Error("detector has no start/startAll/run");

      await new Promise(r => setTimeout(r, 50));
      rememberActiveStream(videoRef.current, detRef.current);

      if (mode === "auto") startAutoTimer();
      setRunning(true);
      setStatus("camera started");
    } catch (e) {
      console.error(e);
      setRunning(false);
      setStatus("error");
    }
  }

  async function stop() {
    setStatus("stopping…");
    try { await stopEverything(detRef.current, videoRef.current, canvasRef.current); }
    catch (e) { console.error(e); }
    finally {
      detRef.current = null;
      setRunning(false);
      setStatus("idle");
    }
  }

  // mirror toggle
  const onMirrorToggle = (e) => {
    const m = !!e.target.checked;
    setMirror(m);
    if (videoRef.current) videoRef.current.style.transform = m ? "scaleX(-1)" : "none";
    try { detRef.current?.setMirror?.(m); } catch {}
  };

  // speech/copy
  const speak = () => { try { const u = new SpeechSynthesisUtterance(text); speechSynthesis.cancel(); speechSynthesis.speak(u); } catch {} };
  const copy  = async () => { try { await navigator.clipboard.writeText(text); } catch {} };

  // start/stop auto timer when mode switches
  useEffect(() => {
    if (!running) return;
    if (mode === "auto") startAutoTimer(); else stopAutoTimer();
    return stopAutoTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, running]);

  // cleanup on unmount and when switching tabs mid-run
  useEffect(() => () => { try { stop(); } catch {} }, []); // eslint-disable-line
  useEffect(() => { if (running) stop(); }, [activeTab]); // stop when tab changes

  // ── UI ───────────────────────────────────────────────────────────────────────
  return (
    <div className="stt-root">
      <header className="stt-top">
        <button className="stt-back" onClick={() => nav(-1)} aria-label="Back">←</button>
        <h1 className="stt-title">Sign to Text</h1>
      </header>

      <div className="stt-card">
        {/* Camera stage */}
        <div className={`stt-video-wrap ${!running ? "stt-paused" : ""}`}>
          <video ref={videoRef} playsInline muted className="stt-video" />
          <canvas ref={canvasRef} className="stt-canvas" />
          {/* chip in bottom-left — only when above per-tab threshold */}
          {running && chip.label && (
            <div className="stt-chip stt-chip--bl">
              {chip.label} {(chip.conf * 100).toFixed(1)}%
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="stt-tabs">
          <button
            className={`stt-tab ${activeTab === "spelling" ? "active" : ""}`}
            onClick={() => setActiveTab("spelling")}
            type="button"
            disabled={running}
          >
            Fingerspelling
          </button>
          <button
            className={`stt-tab ${activeTab === "phrases" ? "active" : ""}`}
            onClick={() => setActiveTab("phrases")}
            type="button"
            disabled={running}
          >
            Phrases
          </button>
        </div>

        {/* Recognized text panel */}
        <div className="stt-panel">
          <div className="stt-panel-head">
            <div className="stt-panel-title">Recognized Text</div>
            <div className="stt-icons">
              <button className="stt-icon" onClick={speak} title="Speak" aria-label="Speak">🔊</button>
              <button className="stt-icon" onClick={copy} title="Copy" aria-label="Copy">📋</button>
            </div>
          </div>

          <textarea
            className="stt-textarea"
            placeholder={
              isKid
                ? "Show your hands to make magic words appear…"
                : "Translation will appear here..."
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>

        {/* Controls */}
        <div className="stt-row">
          {!running ? (
            <button className="stt-btn stt-btn--primary" onClick={start}>Start</button>
          ) : (
            <button className="stt-btn stt-btn--danger" onClick={stop}>Stop</button>
          )}
          <div className="stt-status">Status: {status} • Mode: {mode} • Pipeline: {activeTab}</div>
        </div>

        <label className="stt-check">
          <input type="checkbox" checked={mirror} onChange={onMirrorToggle} />
          Mirror preview
        </label>

        <div className="stt-seg">
          <button
            className={`stt-seg-btn ${mode === "free" ? "active" : ""}`}
            onClick={() => setMode("free")}
            type="button"
          >
            Free form
          </button>
          <button
            className={`stt-seg-btn ${mode === "auto" ? "active" : ""}`}
            onClick={() => setMode("auto")}
            type="button"
          >
            Auto commit ({countdown}s)
          </button>
        </div>

        <div className="stt-row">
          <button className="stt-btn" onClick={space} disabled={activeTab === "phrases"}>Space</button>
          <button className="stt-btn" onClick={backspace} disabled={activeTab === "phrases"}>Backspace</button>
          <button className="stt-btn" onClick={clearText}>Clear</button>
        </div>

        <div className="stt-meta">Hands: {hands}</div>
      </div>
    </div>
  );
}
