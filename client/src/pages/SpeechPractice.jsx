// client/src/pages/SpeechPractice.jsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "@/styles/speech-practice.css";
import "@/styles/kid/speech-practice-kid.css";

/* -------- LocalStorage keys -------- */
const LS_MODE  = "therapy.mode.v1";              // "sentence" | "pronunciation"
const LS_LAST  = "therapy.last.v1";
const LS_LEVEL = "therapy.level.v1";             // "beginner" | "intermediate" | "advanced" | "pro"

/* Daily goal (unique targets per day) */
const LS_DAY_UNIQUE = "therapy.day.unique.v1";   // { day: "<toDateString>", items: ["normalized targets"] }
const LS_COMPLETED  = "therapy.completed.v1";
const LS_LAST_DAY   = "therapy.last_day.v2";

/* Optional streak (if surfaced elsewhere) */
const LS_STREAK = "therapy.streak.v1";

/* History for Progress page */
const LS_THERAPY_HISTORY = "therapy.history.v1"; // [{dateISO, mode, level, target, accuracy, durationSec, countsGoal}]

/* -------- Practice content by difficulty (expanded) -------- */
const CONTENT = {
  beginner: {
    sentences: [
      "Good morning, how are you today?",
      "Please bring me a glass of water.",
      "Thank you for helping me learn.",
      "I am happy to see my friends.",
      "Could you repeat that more slowly?",
      "What is your name and where are you from?",
      "Let's meet again this weekend.",
      "Can you show me the nearest bathroom?",
      "I would like to practice my speech.",
      "I need a little more time, please.",
      "It is nice to meet you.",
      "I feel better when I breathe slowly.",
      "May I have a cup of tea?",
      "Can you help me open this bottle?",
      "I want to try that again."
    ],
    words: [
      "water","happy","friends","please","thank",
      "again","name","slowly","practice","glass",
      "today","help","learn","repeat","bathroom",
      "morning","breathe","better","tea","bottle"
    ]
  },
  intermediate: {
    sentences: [
      "I would like to practice my speech every day.",
      "Let's meet again this weekend at the park.",
      "Can you show me the nearest bathroom, please?",
      "I love learning sign language with my classmates.",
      "What is your favorite food and why?",
      "I forgot the word, could you remind me?",
      "Please speak a little louder and more clearly.",
      "I am trying to improve my pronunciation this month.",
      "The bus arrives in ten minutes, so let's hurry.",
      "I will send you the message after lunch.",
      "We can study together at the library tomorrow.",
      "Could you give me clear directions to the office?",
      "I sometimes get nervous, but I keep practicing.",
      "Thanks for your patience while I find the words.",
      "I want to describe my day step by step."
    ],
    words: [
      "bathroom","learning","weekend","repeat","nearest",
      "classmates","pronounce","practice","morning","language",
      "favorite","nervous","directions","library","message",
      "improve","patient","describe","arrives","minutes"
    ]
  },
  advanced: {
    sentences: [
      "Please provide a brief explanation of the instructions you mentioned.",
      "I appreciate your patience while I improve my pronunciation.",
      "Could you clarify the last sentence because I missed a word?",
      "I am trying to articulate clearly even when I feel nervous.",
      "Let’s schedule a session tomorrow to review the feedback.",
      "Your example helped me understand the rhythm of the phrase.",
      "I struggle with consonant clusters at the beginning of words.",
      "The microphone sensitivity seems high; can we adjust it?",
      "Consistent practice makes the sounds feel more natural.",
      "I noticed my intonation dropping at the end of statements.",
      "Please repeat the phrase and emphasize the key syllables.",
      "I want to compare my recording with a model speaker.",
      "Breathing from the diaphragm helps me control airflow.",
      "I am focusing on accuracy without losing fluency.",
      "The second syllable should be stressed more strongly."
    ],
    words: [
      "articulate","pronunciation","clarify","patience","nervous",
      "session","feedback","explanation","instruction","schedule",
      "rhythm","syllable","intonation","consonant","cluster",
      "sensitivity","diaphragm","airflow","accuracy","fluency"
    ]
  },
  pro: {
    sentences: [
      "Despite the background noise, I attempted to enunciate each consonant accurately.",
      "Please evaluate my intonation and provide constructive recommendations.",
      "I am striving for consistent pacing without sacrificing clarity.",
      "Your guidance significantly accelerates my communicative progress.",
      "Kindly highlight mispronunciations that recur so I can prioritize them.",
      "When I monitor resonance, the vowels sound richer and more stable.",
      "Coarticulation affects how quickly I can produce complex phrases.",
      "I want to internalize stress patterns across multisyllabic vocabulary.",
      "Let’s analyze my timing and reduce unintended hesitations.",
      "Precise articulation improves intelligibility in challenging acoustic spaces.",
      "I would like feedback on sibilant control and plosive release.",
      "Please contrast American and British variants for this sentence.",
      "My goal is automaticity rather than deliberate sound-by-sound planning.",
      "I’m experimenting with forward focus to brighten the tone.",
      "Subtle prosodic changes can shift the listener’s interpretation."
    ],
    words: [
      "enunciate","intonation","consonant","accuracy","constructive",
      "consistent","clarity","mispronunciation","prioritize","resonance",
      "coarticulation","multisyllabic","automaticity","prosody","intelligibility",
      "sibilant","plosive","variant","articulation","acoustic"
    ]
  }
};

/* -------- Text & scoring helpers -------- */
const STOPWORDS = new Set([
  "i","you","my","your","me","is","am","are","was","were",
  "to","the","a","an","and","or","of","in","on","it","that",
  "this","would","like","please","can","could","do","does","did",
  "be","been","will","shall","let","lets","let's","we","they","he","she","for","so"
]);

const CONTRACTIONS = [
  ["i'm","i am"], ["you're","you are"], ["he's","he is"], ["she's","she is"],
  ["it's","it is"], ["we're","we are"], ["they're","they are"], ["that's","that is"],
  ["there's","there is"], ["what's","what is"], ["who's","who is"],
  ["i've","i have"], ["we've","we have"], ["they've","they have"],
  ["i'd","i would"], ["you'd","you would"], ["he'd","he would"], ["she'd","she would"], ["they'd","they would"],
  ["i'll","i will"], ["you'll","you will"], ["he'll","he will"], ["she'll","she will"], ["they'll","they will"],
  ["don't","do not"], ["doesn't","does not"], ["didn't","did not"],
  ["can't","cannot"], ["couldn't","could not"], ["won't","will not"], ["wouldn't","would not"],
  ["isn't","is not"], ["aren't","are not"], ["wasn't","was not"], ["weren't","were not"],
  ["let's","let us"]
];

function expandContractions(s) {
  let out = " " + (s || "").toLowerCase() + " ";
  for (const [c, full] of CONTRACTIONS) out = out.replaceAll(" " + c + " ", " " + full + " ");
  return out.trim();
}

function normTokens(str) {
  const expanded = expandContractions(str || "");
  return expanded
    .normalize("NFKC")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}
const contentOnly = (arr) => arr.filter(w => !STOPWORDS.has(w));

function stemLite(w) {
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (w.endsWith("es")  && w.length > 3 && !w.endsWith("ses")) return w.slice(0, -2);
  if (w.endsWith("s")   && w.length > 3 && !w.endsWith("ss"))  return w.slice(0, -1);
  if (w.endsWith("ing") && w.length > 5) return w.slice(0, -3);
  if (w.endsWith("ed")  && w.length > 4) return w.slice(0, -2);
  return w;
}

/* normalized Levenshtein 0..1 + stem boost */
function wordSim(a, b) {
  a = a || ""; b = b || "";
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  let s = 1 - dp[m][n] / Math.max(1, Math.max(m, n));
  if (stemLite(a) === stemLite(b)) s = Math.max(s, 0.9);
  return Math.max(0, Math.min(1, s));
}

/* Quick hints for word mode */
function wordHints(target, heard) {
  const t = (target || "").toLowerCase();
  const firstHeardWord = (heard || "").toLowerCase().split(/\s+/).filter(Boolean)[0] || "";
  const h = firstHeardWord;
  const hints = [];
  if (!h) return ["No speech detected or not recognized. Try again closer to the mic."];

  if (t[0] && h[0] && t[0] !== h[0]) hints.push(`Start sound: try “${t[0]}”`);
  if (t.slice(-1) && h.slice(-1) && t.slice(-1) !== h.slice(-1)) hints.push(`End sound: finish with “${t.slice(-1)}”`);
  const V = (s) => [...new Set([...s].filter(c => "aeiou".includes(c)))];
  const tv = V(t), hv = V(h);
  tv.forEach(v => { if (!hv.includes(v)) hints.push(`Say the vowel “${v}” clearly`); });
  if (Math.abs(t.length - h.length) >= 2) hints.push("Keep all syllables—don’t drop or add sounds.");
  return hints.slice(0, 3);
}

function alignTokens(targetStr, spokenStr) {
  const T = normTokens(targetStr);
  const S = normTokens(spokenStr);
  const m = T.length, n = S.length;

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  const bt = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(null));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const sim = wordSim(T[i - 1], S[j - 1]);
      const sub = dp[i - 1][j - 1] + (1 - sim);
      const del = dp[i - 1][j] + 1;
      const ins = dp[i][j - 1] + 1;
      const best = Math.min(sub, del, ins);
      dp[i][j] = best;
      bt[i][j] = best === sub ? "sub" : best === del ? "del" : "ins";
    }
  }

  const ops = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    const move = bt[i][j] || (i && !j ? "del" : "ins");
    if (move === "sub") {
      const tgt = T[i - 1], spk = S[j - 1] ?? "";
      const sim = wordSim(tgt, spk);
      const type = sim > 0.85 ? "match" : "sub";
      ops.push({ target: tgt, heard: spk, type, score: Math.round(sim * 100) });
      i--; j--;
    } else if (move === "del") {
      ops.push({ target: T[i - 1], heard: "", type: "miss", score: 0 });
      i--;
    } else {
      ops.push({ target: "", heard: S[j - 1], type: "extra", score: 0 });
      j--;
    }
  }
  ops.reverse();

  const Tcontent = contentOnly(T), Scontent = contentOnly(S);
  const f1 = (() => {
    if (!Tcontent.length || !Scontent.length) return 0;
    const count = (arr) => arr.reduce((m, t) => ((m[t] = (m[t] || 0) + 1), m), {});
    const ca = count(Tcontent), cb = count(Scontent);
    let common = 0;
    for (const k in ca) common += Math.min(ca[k] || 0, cb[k] || 0);
    const p = common / Scontent.length, r = common / Tcontent.length;
    return (p + r === 0) ? 0 : (2 * p * r) / (p + r);
  })();

  const nonExtra = ops.filter(o => o.type !== "extra");
  const meanSim = nonExtra.reduce((s,o)=>s+o.score,0) / Math.max(1, nonExtra.length);
  const contentCommon = new Set(Tcontent.filter(w => Scontent.includes(w))).size;

  let overall = (0.7 * f1 + 0.3 * (meanSim/100)) * 100;
  if (contentCommon === 0) overall = Math.min(overall, 5);
  overall = Math.round(Math.max(0, Math.min(100, overall)));

  return { tokens: ops, overall, driftZero: contentCommon === 0 };
}

/* ---- Unique-per-day tracker (Daily Goal) ---- */
function normalizeTargetKey(s) {
  return (s || "")
    .toLowerCase().normalize("NFKC")
    .replace(/[^a-z0-9'\s]/g, " ").replace(/\s+/g, " ").trim();
}
function recordUniqueTarget(target) {
  const key = normalizeTargetKey(target);
  const today = new Date().toDateString();

  let data;
  try { data = JSON.parse(localStorage.getItem(LS_DAY_UNIQUE) || "null"); }
  catch { data = null; }
  if (!data || data.day !== today) data = { day: today, items: [] };

  if (!data.items.includes(key)) {
    data.items.push(key);
    localStorage.setItem(LS_DAY_UNIQUE, JSON.stringify(data));
    localStorage.setItem(LS_COMPLETED, String(data.items.length));
    localStorage.setItem(LS_LAST_DAY, today);
  } else {
    localStorage.setItem(LS_LAST_DAY, today);
  }
}

/* -------- Web Speech helpers -------- */
function getSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  return SR ? new SR() : null;
}

const pickBestAlt = (alts, target) => {
  let best = alts[0] || "";
  let bestScore = -1;
  const tgtContent = new Set(contentOnly(normTokens(target)));
  for (const a of alts) {
    const words = contentOnly(normTokens(a || ""));
    let score = 0;
    for (const w of words) if (tgtContent.has(w)) score += 1;
    if (score > bestScore) { bestScore = score; best = a || ""; }
  }
  return best;
};

function speak(text) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {}
}

/* ===== Difficulty metadata ===== */
const LEVELS = [
  { key: "beginner",     name: "Beginner" },
  { key: "intermediate", name: "Intermediate" },
  { key: "advanced",     name: "Advanced" },
  { key: "pro",          name: "Pro" },
];

/* =================== Component =================== */
export default function SpeechPractice() {
  const nav = useNavigate();

  /* Mode from Therapy page (default to sentence) */
  const [mode] = useState(() => {
    const v = localStorage.getItem(LS_MODE);
    return v === "pronunciation" ? "pronunciation" : "sentence";
  });

  /* Difficulty (persisted) */
  const [level, setLevel] = useState(() => {
    const v = localStorage.getItem(LS_LEVEL);
    return LEVELS.some(l => l.key === v) ? v : "beginner";
  });
  useEffect(() => { localStorage.setItem(LS_LEVEL, level); }, [level]);

  // reveal/countdown/target
  const [target, setTarget] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // speech
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [spokenText, setSpokenText] = useState("");   // <-- keep what we will grade/show
  const [error, setError] = useState("");

  // result
  const [finished, setFinished] = useState(false);
  const [accuracy, setAccuracy] = useState(null);
  const [breakdown, setBreakdown] = useState([]);
  const [driftZero, setDriftZero] = useState(false);

  // waveform
  const [waveMode, setWaveMode] = useState("real");
  const canvasRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const rafRef = useRef(null);

  // SR refs/state
  const srRef = useRef(null);
  const finalTextRef = useRef("");
  const finishingRef = useRef(false);
  const finalizeTimer = useRef(null);

  /* ---------- waveform drawing ---------- */
  const drawWave = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    const len = analyser.fftSize;
    const data = new Uint8Array(len);
    analyser.getByteTimeDomainData(data);

    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "var(--primary)";
    ctx.beginPath();
    const slice = w / len; let x = 0;
    for (let i = 0; i < len; i++) {
      const v = data[i] / 128.0;
      const y = (v * h) / 2;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      x += slice;
    }
    ctx.stroke();

    rafRef.current = requestAnimationFrame(drawWave);
  }, []);

  const startWaveform = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
      });
      mediaStreamRef.current = stream;

      const AudioC = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioC();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;

      const src = audioCtx.createMediaStreamSource(stream);
      src.connect(analyser);

      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;

      setWaveMode("real");
      drawWave();
      return true;
    } catch {
      setWaveMode("css");
      return false;
    }
  }, [drawWave]);

  const stopWaveform = useCallback(() => {
    cancelAnimationFrame(rafRef.current || 0);
    rafRef.current = null;
    try { audioCtxRef.current?.close(); } catch {}
    audioCtxRef.current = null;
    analyserRef.current = null;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  /* ---------- recognition ---------- */
  const startRecognition = useCallback(() => {
    setError("");
    const sr = getSpeechRecognition();
    if (!sr) { setError("SpeechRecognition is not supported in this browser."); return false; }
    sr.lang = "en-US";
    sr.continuous = true;
    sr.interimResults = true;
    sr.maxAlternatives = 5;

    finalTextRef.current = "";
    finishingRef.current = false;

    sr.onresult = (evt) => {
      let finalText = finalTextRef.current;
      let interim = "";

      for (let i = evt.resultIndex; i < evt.results.length; i++) {
        const res = evt.results[i];
        const alts = [];
        for (let j = 0; j < res.length; j++) alts.push(res[j]?.transcript || "");
        const pick = (alts.length ? pickBestAlt(alts, target) : (res[0]?.transcript || ""));

        if (res.isFinal) {
          if (pick) finalText += (finalText ? " " : "") + pick.trim();
        } else {
          interim = (pick || "").trim();
        }
      }

      finalTextRef.current = finalText;
      const combined = (finalText + " " + interim).trim();
      if (combined) setTranscript(combined);

      if (finishingRef.current) {
        clearTimeout(finalizeTimer.current);
        finalizeTimer.current = setTimeout(() => finalize(finalTextRef.current || combined, true), 350);
      }
    };

    sr.onerror = (e) => {
      const kind = e?.error || "speech error";
      setError(kind === "audio-capture"
        ? "Microphone is busy or not accessible. Check site mic permissions."
        : kind);
    };

    sr.onend = () => {
      setListening(false);
      if (finishingRef.current) {
        clearTimeout(finalizeTimer.current);
        finalizeTimer.current = setTimeout(() => finalize(finalTextRef.current || transcript, true), 350);
      }
    };

    try {
      sr.start();
      srRef.current = sr;
      setListening(true);
      return true;
    } catch {
      setError("Unable to start recognition.");
      return false;
    }
  }, [target, transcript]);

  const stopRecognition = useCallback(() => {
    try { srRef.current?.stop(); } catch {}
    srRef.current = null;
  }, []);

  /* ---------- finalize + logging ---------- */
  const appendHistory = (entry) => {
    try {
      const hist = JSON.parse(localStorage.getItem(LS_THERAPY_HISTORY) || "[]");
      hist.push(entry);
      localStorage.setItem(LS_THERAPY_HISTORY, JSON.stringify(hist.slice(-500))); // keep last 500
    } catch {}
  };

  const finalize = (text, countProgress) => {
    stopWaveform();

    const spoken = (text || transcript || "").trim();
    setSpokenText(spoken); // <-- show to the user

    if (mode === "sentence") {
      const { tokens, overall, driftZero: dz } = alignTokens(target, spoken);
      setBreakdown(tokens.filter(t => t.target));
      setAccuracy(overall);
      setDriftZero(dz);
      setFinished(true);
      if (countProgress) recordUniqueTarget(target);
    } else {
      // pronunciation (single word)
      const sim = wordSim((target || "").toLowerCase(), (spoken || "").toLowerCase());
      const score = Math.round(sim * 100);
      const type = score >= 85 ? "match" : (score >= 60 ? "sub" : "miss");
      setBreakdown([{ target, heard: spoken, type, score }]);
      setAccuracy(score);
      // Treat very low similarity as "drift"
      setDriftZero(score < 30 && !!spoken && normalizeTargetKey(spoken) !== normalizeTargetKey(target));
      setFinished(true);
      if (countProgress) recordUniqueTarget(target);
    }

    // Save "last practice" summary (for Therapy card)
    const accNow = mode === "sentence"
      ? (alignTokens(target, spoken).overall)
      : Math.round(wordSim(target, spoken) * 100);

    const last = {
      accuracy: accNow,
      fluency: accNow >= 85 ? "Excellent" : accNow >= 70 ? "Good" : "Fair",
      dateISO: new Date().toISOString(),
    };
    localStorage.setItem(LS_LAST, JSON.stringify(last));

    // streak example (optional)
    if (countProgress) {
      const today = new Date().toDateString();
      const lastDay = localStorage.getItem(LS_LAST_DAY);
      if (lastDay !== today) {
        const prev = Number(localStorage.getItem(LS_STREAK)) || 0;
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        const next = (lastDay === yesterday ? prev + 1 : 1);
        localStorage.setItem(LS_STREAK, String(next));
        localStorage.setItem(LS_LAST_DAY, today);
      }
    }

    // ---- append to therapy history (for Progress page)
    const started = window.__ht_listen_start || Date.now();
    const durationSec = Math.max(1, Math.round((Date.now() - started) / 1000));
    appendHistory({
      dateISO: new Date().toISOString(),
      mode,
      level,
      target,
      accuracy: accNow,
      durationSec,
      countsGoal: !!countProgress
    });
  };

  /* ---------- UI handlers ---------- */
  const onMic = async () => {
    if (!revealed || !target) return; // target locked until reveal
    if (listening) {
      finishingRef.current = true;
      stopRecognition();
      return;
    }
    setFinished(false);
    setTranscript("");
    setSpokenText("");
    setAccuracy(null);
    setBreakdown([]);
    setDriftZero(false);

    // mark listen start for duration metrics
    window.__ht_listen_start = Date.now();

    const srOK = startRecognition();
    if (srOK) setTimeout(() => { startWaveform(); }, 150);
  };

  const onFinish = () => {
    if (!listening) {
      finalize(finalTextRef.current || transcript, true);
      return;
    }
    finishingRef.current = true;
    stopRecognition();
  };

  const onRetry = () => {
    // retry without counting progress
    setFinished(false);
    setTranscript("");
    setSpokenText("");
    setAccuracy(null);
    setBreakdown([]);
    setDriftZero(false);
    finalTextRef.current = "";
    finishingRef.current = false;

    window.__ht_listen_start = Date.now();

    const srOK = startRecognition();
    if (srOK) setTimeout(() => { startWaveform(); }, 150);
  };

  // cleanup
  useEffect(() => () => {
    stopRecognition();
    stopWaveform();
    clearTimeout(finalizeTimer.current);
  }, [stopRecognition]);

  // reveal a target according to mode + difficulty
  const onReveal = () => {
    if (revealed || countdown > 0) return;

    const pool = CONTENT[level];
    const revealSentence = () => {
      const rand = pool.sentences[Math.floor(Math.random() * pool.sentences.length)];
      setTarget(rand);
      setRevealed(true);
    };
    const revealWord = () => {
      const rand = pool.words[Math.floor(Math.random() * pool.words.length)];
      setTarget(rand);
      setRevealed(true);
    };

    setTranscript(""); setFinished(false); setAccuracy(null); setBreakdown([]);
    setSpokenText("");
    setDriftZero(false);
    setCountdown(3);
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(id);
          (mode === "sentence" ? revealSentence : revealWord)();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const rerollPhrase = () => {
    if (!revealed) return;
    setRevealed(false);
    setTarget("");
    onReveal();
  };

  /* ---------- drill ---------- */
  const [drillOpen, setDrillOpen] = useState(false);
  const [drillWord, setDrillWord] = useState("");
  const [drillListening, setDrillListening] = useState(false);
  const [drillText, setDrillText] = useState("");
  const [drillScore, setDrillScore] = useState(null);

  const openDrill = (word) => {
    speak(word);
    setDrillWord(word);
    setDrillText("");
    setDrillScore(null);
    setDrillOpen(true);
  };
  const startDrill = () => {
    const sr = getSpeechRecognition();
    if (!sr) { setDrillText("SpeechRecognition not supported."); return; }
    sr.lang = "en-US"; sr.continuous = false; sr.interimResults = false; sr.maxAlternatives = 3;

    setDrillListening(true);
    let best = "";

    sr.onresult = (evt) => {
      for (let i = 0; i < evt.results.length; i++) {
        const res = evt.results[i];
        for (let j = 0; j < res.length; j++) {
          const alt = res[j]?.transcript || "";
          if (!best) best = alt;
          else if (wordSim(drillWord, alt) > wordSim(drillWord, best)) best = alt;
        }
      }
      setDrillText(best.trim());
    };
    sr.onerror = () => setDrillListening(false);
    sr.onend = () => {
      setDrillListening(false);
      const sc = Math.round(wordSim(drillWord, (best || "").trim().toLowerCase()) * 100);
      setDrillScore(sc);
    };
    try { sr.start(); } catch {}
  };

  /* ---------- UI text ---------- */
  const revealLabel = revealed
    ? target
    : (mode === "sentence" ? "Tap to reveal the phrase" : "Tap to reveal the word");

  return (
    <div className="sp-page">
      <header className="sp-topbar">
        <button className="sp-back-plain" onClick={() => nav(-1)} aria-label="Back">←</button>
        <div className="sp-title">Speech Practice</div>
      </header>

      <main className="sp-main stretch">
        {/* Difficulty segmented control */}
        <div className="sp-level-seg" role="tablist" aria-label="Difficulty">
          {LEVELS.map(l => (
            <button
              key={l.key}
              role="tab"
              className={`seg-btn ${level === l.key ? "on" : ""}`}
              onClick={() => { setLevel(l.key); if (revealed) { setRevealed(false); setTarget(""); } }}
              aria-selected={level === l.key}
            >
              {l.name}
            </button>
          ))}
        </div>

        {/* Reveal/Instruction */}
        <div
          className={`sp-reveal ${revealed ? "revealed" : ""}`}
          role="button"
          tabIndex={0}
          onClick={revealed ? rerollPhrase : onReveal}
          onKeyDown={(e) => ((e.key === "Enter" || e.key === " ") && (revealed ? rerollPhrase() : onReveal()))}
          aria-label={revealLabel}
        >
          {!revealed && countdown === 0 && <span className="sp-muted">{revealLabel}</span>}
          {!revealed && countdown > 0 && <span className="sp-count">{countdown}</span>}
          {revealed && <span className="sp-phrase">{target}</span>}
        </div>

        {/* Mic + waveform */}
        <section className="sp-card">
          <button
            className={`sp-mic ${listening ? "on" : ""} ${!revealed ? "locked" : ""}`}
            onClick={onMic}
            aria-pressed={listening}
            aria-label={listening ? "Stop recording" : "Start recording"}
            disabled={!revealed}
          >
            🎤
          </button>

          <div className={`sp-wave ${waveMode === "css" ? "css" : ""}`}>
            {waveMode === "real" ? (
              <canvas ref={canvasRef} width={320} height={72} />
            ) : (
              <div className="sp-faux-bars" aria-hidden><i/><i/><i/><i/><i/></div>
            )}
            {!listening && (
              <div className="sp-wave-overlay">
                {revealed ? "Tap the mic to start" : "Reveal the target first"}
              </div>
            )}
          </div>

          <div className="sp-controls">
            <button className="sp-pill strong" onClick={onFinish}>Finish</button>
            {finished && (
              <button className="sp-pill" onClick={onRetry} title="Retry without counting progress">
                Try again
              </button>
            )}
            {revealed && (
              <button className="sp-pill" onClick={() => speak(target)} title="Hear the target">
                ▶️ Hear it
              </button>
            )}
          </div>
        </section>

        {/* Results */}
        <section className="sp-result">
          <div className="sp-result-title">Result</div>
          <div className="sp-result-row">
            <span>{finished ? `${accuracy}%` : "—"}</span>
            <div className="sp-bar"><div className="sp-bar-fill" style={{ width: finished ? `${accuracy}%` : "0%" }} /></div>
          </div>

          {/* You said */}
          {finished && (
            <div className="sp-note"><b>You said:</b> {spokenText || "—"}</div>
          )}

          {/* Unrelated / drift message */}
          {finished && driftZero && (
            <div className="sp-warning">
              That sounds unrelated to the target. Try repeating the exact {mode === "sentence" ? "phrase" : "word"} above,
              or tap <b>Hear it</b> to listen once.
            </div>
          )}

          {/* Sentence breakdown */}
          {finished && mode === "sentence" && (
            <>
              <div className="sp-breakdown-title">Pronunciation by word</div>
              <div className="sp-tokens">
                {breakdown.map((b, idx) => (
                  <button
                    key={idx}
                    className={`sp-chip ${b.type}`}
                    onClick={() => (b.type !== "match" ? openDrill(b.target) : null)}
                    title={b.type !== "match" ? "Tap to practice this word" : ""}
                  >
                    <span className="w">{b.target}</span>
                    {b.type === "match" && <span className="s">{b.score}%</span>}
                    {b.type === "sub"   && <span className="s">{b.score}%</span>}
                    {b.type === "miss"  && <span className="s">missed</span>}
                  </button>
                ))}
              </div>

              {/* Why this score */}
              {(() => {
                const miss = breakdown.filter(b => b.type === "miss").map(b => b.target);
                const subs = breakdown.filter(b => b.type === "sub" && b.score < 70).map(b => `${b.target} → ${b.heard || "?"}`);
                const extras = normTokens(spokenText).filter(w => !breakdown.find(b => b.heard === w && b.target));
                return (
                  <div className="sp-tips">
                    <div className="tip"><b>Why this score</b></div>
                    {miss.length > 0 && <div className="tip"><b>Missed:</b> {miss.join(", ")}</div>}
                    {subs.length > 0 && <div className="tip"><b>Sounded like:</b> {subs.join(", ")}</div>}
                    {extras.length > 0 && <div className="tip"><b>Extra words:</b> {extras.join(", ")}</div>}
                  </div>
                );
              })()}

              <div className="sp-note">
                <b>How it works:</b> We transcribe your speech, align it to the target sentence,
                and grade each word. Tap a red/yellow chip to drill that word.
              </div>
            </>
          )}

          {/* Pronunciation: single word */}
          {finished && mode === "pronunciation" && (
            <>
              <div className="sp-breakdown-title">Word score</div>
              <div className="sp-tokens">
                {breakdown.map((b, idx) => (
                  <button
                    key={idx}
                    className={`sp-chip ${b.type}`}
                    onClick={() => (b.type !== "match" ? openDrill(b.target) : null)}
                  >
                    <span className="w">{b.target}</span>
                    <span className="s">{b.type === "miss" ? "missed" : `${b.score}%`}</span>
                  </button>
                ))}
              </div>

              {/* Why this score (word) */}
              {(() => {
                const b = breakdown[0] || { target, heard: spokenText, type: "miss", score: 0 };
                const hints = wordHints(b.target, b.heard);
                return (
                  <div className="sp-tips">
                    <div className="tip"><b>Why this score</b></div>
                    <div className="tip"><b>Heard as:</b> {b.heard || "—"}</div>
                    {hints.map((h, i) => <div className="tip" key={i}>• {h}</div>)}
                  </div>
                );
              })()}

              <div className="sp-note">Tap the chip to drill the word again.</div>
            </>
          )}

          {error && <div className="sp-err">{error}</div>}
        </section>
      </main>

      {/* Per-word drill modal */}
      {drillOpen && (
        <div className="sp-modal" role="dialog" aria-modal="true">
          <div className="sp-modal-card">
            <div className="sp-modal-title">Practice: <b>{drillWord}</b></div>
            <div className="sp-modal-row">
              <button className="sp-pill" onClick={() => speak(drillWord)}>▶️ Hear word</button>
              <button className={`sp-pill strong ${drillListening ? "disabled" : ""}`} onClick={startDrill} disabled={drillListening}>
                {drillListening ? "Listening…" : "Record"}
              </button>
            </div>
            <div className="sp-modal-body">
              <div><b>You said:</b> {drillText || "—"}</div>
              <div><b>Score:</b> {drillScore != null ? `${drillScore}%` : "—"} {drillScore != null && (drillScore >= 85 ? "✅ Good!" : "↻ Try again")}</div>
            </div>
            <div className="sp-modal-actions">
              <button className="sp-pill" onClick={() => setDrillOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
