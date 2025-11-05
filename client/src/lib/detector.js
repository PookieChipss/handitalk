const HANDS_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/hands/";
const MODEL_URL = "/models/handitalk_landmarks.tflite";
const LABELS_URL = "/models/class_names_landmarks.json";

const clamp01 = (v) => Math.max(0, Math.min(1, v));
function normalizeLabels(raw) {
  if (Array.isArray(raw)) return raw;
  const out = []; for (const [name, idx] of Object.entries(raw || {})) out[idx] = name;
  return out;
}
function toVec42(lms, flipX) {
  const out = new Float32Array(42);
  for (let i = 0; i < 21; i++) {
    let x = clamp01(lms[i].x); if (flipX) x = 1 - x;
    const y = clamp01(lms[i].y);
    out[i * 2] = x; out[i * 2 + 1] = y;
  }
  return out;
}

export async function createDetector(opts = {}) {
  const {
    video,
    canvas,
    mirror: mirrorIn = true,
    onHands = () => {},
    onPredict = () => {},
  } = opts;

  // <- mutable flag so setMirror() affects classification
  let mirrorFlag = !!mirrorIn;

  const tf = window.tf;
  if (!tf) throw new Error("tfjs missing");
  const tflite = window.tflite;
  if (!tflite || !tflite.loadTFLiteModel) throw new Error("tflite missing");
  if (!window.Hands) throw new Error("mediapipe missing");

  const model = await tflite.loadTFLiteModel(MODEL_URL);
  const rawLabels = await fetch(LABELS_URL).then((r) => r.json());
  const classNames = normalizeLabels(rawLabels);

  let stream = null, hands = null, rafId = 0, running = false;
  const ctx = canvas.getContext("2d");

  hands = new window.Hands({ locateFile: (f) => `${HANDS_CDN}${f}` });
  hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.35, minTrackingConfidence: 0.35 });

  hands.onResults(async (results) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    if (mirrorFlag) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }

    const ll = results.multiHandLandmarks || [];
    onHands(ll.length);

    for (const lm of ll) {
      window.drawConnectors(ctx, lm, window.HAND_CONNECTIONS, { color: "#FFFFFF", lineWidth: 3 });
      window.drawLandmarks(ctx, lm, { color: "#FFFFFF", lineWidth: 1.5, radius: 2.6 });
    }
    ctx.restore();

    if (ll.length) {
      const feats = toVec42(ll[0], mirrorFlag);
      const pred = await predictAdaptive(tf, model, feats, classNames);
      onPredict(pred); // {label, conf}
    } else {
      onPredict({ label: "—", conf: 0, char: null });
    }
  });

  async function predictAdaptive(tf, tflModel, feats, classNames) {
    const tryFlat = () => { const x = tf.tensor(feats, [1, 42], "float32"); let y; try { y = tflModel.predict(x); } finally { x.dispose(); } return y; };
    const trySeq  = (T) => { const seq = new Float32Array(T * 42); for (let t = 0; t < T; t++) seq.set(feats, t * 42); const x = tf.tensor(seq, [1, T, 42], "float32"); let y; try { y = tflModel.predict(x); } finally { x.dispose(); } return y; };
    let y = null;
    try { try { y = tryFlat(); } catch { try { y = trySeq(32); } catch { y = trySeq(64); } } } catch { return { label: "—", conf: 0, char: null }; }
    const raw = await y.data(); y.dispose();
    const sum = raw.reduce((a, b) => a + b, 0);
    let probs = raw;
    if (!(sum > 0.98 && sum < 1.02)) {
      const m = Math.max(...raw), exps = raw.map(v => Math.exp(v - m));
      const s = exps.reduce((a, b) => a + b, 0); probs = exps.map(v => v / s);
    }
    let bi = -1, bp = -1; for (let i = 0; i < probs.length; i++) if (probs[i] > bp) { bp = probs[i]; bi = i; }
    return { label: classNames[bi] ?? `class_${bi}`, conf: bp };
  }

  async function start() {
    if (running) return; running = true;
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } });
    video.srcObject = stream; await video.play();
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    video.style.transform = mirrorFlag ? "scaleX(-1)" : "none";

    const loop = async () => {
      if (!running) return;
      try { await hands.send({ image: video }); } catch {}
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
  }

  async function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    try { await hands.close?.(); } catch {}
    if (stream) { try { stream.getTracks().forEach((t) => t.stop()); } catch {} }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function setMirror(m) {
    mirrorFlag = !!m;
    if (video) video.style.transform = mirrorFlag ? "scaleX(-1)" : "none";
  }

  return { start, stop, setMirror };
}
