// Phrases detector with crop-space projection + selectable flatten order + tighter box.

const tf = window.tf;
if (!tf) throw new Error("TFJS missing (window.tf). Include tf.min.js in index.html.");
if (!window.Hands) throw new Error("MediaPipe Hands missing. Include hands.js in index.html.");

const BASE       = "/models/phrases";
const MODEL_URL  = `${BASE}/model.json`;
const LABELS_URL = `${BASE}/sign_labels.json`;
const NORM_URL   = `${BASE}/norm_stats.json`;

// ── Tunables ────────────────────────────────────────────────────────────────
const SMOOTH         = 7;        // steadier voting
const PAD_PIXELS     = 10;       // small, constant pad (no oversized square)
const FLATTEN_MODE   = "grouped";  // <<< TRY "grouped" first, then "interleaved"
const SHOW_POINTS    = true;     // debug: draw 21 landmark dots
const MIN_CONF_TAG   = 0.00;     // we still forward score to your pill anyway
// ───────────────────────────────────────────────────────────────────────────

function normalizeCenterScale(lm) {
  const xs = lm.map(p => p.x), ys = lm.map(p => p.y);
  const cx = xs.reduce((a,b)=>a+b,0)/xs.length;
  const cy = ys.reduce((a,b)=>a+b,0)/ys.length;
  const shifted = lm.map(p => ({x:p.x-cx, y:p.y-cy, z:p.z ?? 0}));
  let span = 0; for (const p of shifted) span = Math.max(span, Math.hypot(p.x, p.y));
  const s = span || 1;
  return shifted.map(p => ({x:p.x/s, y:p.y/s, z:p.z}));
}

// flatteners
function flattenInterleavedXYZ(lm){const v=new Float32Array(63);let i=0;for(const p of lm){v[i++]=p.x;v[i++]=p.y;v[i++]=p.z;}return v;}
function flattenGroupedXYZ(lm){const v=new Float32Array(63);let i=0;for(const p of lm)v[i++]=p.x;for(const p of lm)v[i++]=p.y;for(const p of lm)v[i++]=p.z??0;return v;}
function flattenInterleavedXY(lm){const v=new Float32Array(42);let i=0;for(const p of lm){v[i++]=p.x;v[i++]=p.y;}return v;}
function flattenGroupedXY(lm){const v=new Float32Array(42);let i=0;for(const p of lm)v[i++]=p.x;for(const p of lm)v[i++]=p.y;return v;}

function standardize(vec, mean, scale) {
  const out=new Float32Array(vec.length);
  for (let i=0;i<vec.length;i++) out[i]=(vec[i]-mean[i])/(scale[i]+1e-6);
  return out;
}

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

export default async function PhrasesDetectorFactory(opts) {
  const { video, canvas, mirror = true, onPredict=()=>{}, onHands=()=>{}, setRAF=()=>{} } = opts || {};
  if (!video || !canvas) throw new Error("phrases_detector: video/canvas missing");

  const [model, labelsMap, normStats] = await Promise.all([
    tf.loadLayersModel(MODEL_URL),
    fetch(LABELS_URL).then(r=>r.json()),
    fetch(NORM_URL).then(r=>r.json()),
  ]);

  // Auto-detect feature length; we’ll pick XY vs XYZ from your norm_stats size.
  const FEAT_DIM = Array.isArray(normStats.mean) ? normStats.mean.length : 63;
  const USE_XYZ  = (FEAT_DIM === 63);
  const mean     = new Float32Array(normStats.mean);
  const scale    = new Float32Array(normStats.scale);

  try {
    const dummy = tf.zeros([1, FEAT_DIM], "float32");
    const y = model.predict(dummy);
    const outUnits = (Array.isArray(y.shape) ? y.shape : (y[0]?.shape||[])).slice(-1)[0] ?? "?";
    console.log(`[phrases] model ok · feat_dim=${FEAT_DIM} xyz=${USE_XYZ} · flatten=${FLATTEN_MODE} · classes=${outUnits}`);
    tf.dispose(y); dummy.dispose();
  } catch(e) { console.error("Model probe failed:", e); }

  const labels = new Map(Object.entries(labelsMap).map(([k,v]) => [Number(k), String(v)]));

  const hands = new window.Hands({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
  });
  hands.setOptions({ maxNumHands:1, minDetectionConfidence:0.45, minTrackingConfidence:0.45, modelComplexity:1 });

  const ctx = canvas.getContext("2d");
  let running=false, stream=null, rafId=0;
  const votes=[];

  hands.onResults(async (res) => {
    const lm = res.multiHandLandmarks?.[0];
    const n  = res.multiHandLandmarks?.length || 0;
    onHands(n);

    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);

    if (!lm) { onPredict({label:"—", conf:0, char:null}); return; }

    // handedness → canonical RIGHT
    let isLeft=false;
    try {
      const lab=res.multiHandedness?.[0]?.classification?.[0]?.label||"";
      isLeft = lab.toLowerCase()==="left";
    } catch {}

    // full-frame pixel coords (do NOT mirror here)
    const lmFull = lm.map(p => ({ x:(isLeft?1-p.x:p.x)*W, y:p.y*H, z:p.z??0 }));

    // hull/minmax box with small constant pad
    let minX=+1e9, minY=+1e9, maxX=-1e9, maxY=-1e9;
    for (const p of lmFull) { if (p.x<minX) minX=p.x; if (p.y<minY) minY=p.y; if (p.x>maxX) maxX=p.x; if (p.y>maxY) maxY=p.y; }
    const x1 = clamp(Math.floor(minX) - PAD_PIXELS, 0, W-1);
    const y1 = clamp(Math.floor(minY) - PAD_PIXELS, 0, H-1);
    const x2 = clamp(Math.ceil (maxX) + PAD_PIXELS, 0, W-1);
    const y2 = clamp(Math.ceil (maxY) + PAD_PIXELS, 0, H-1);
    const bw = Math.max(4, x2-x1), bh = Math.max(4, y2-y1);

    // project landmarks into this crop-space [0..1]
    const lmCrop = lmFull.map(p => ({
      x: clamp((p.x - x1)/bw, 0, 1),
      y: clamp((p.y - y1)/bh, 0, 1),
      z: p.z,
    }));

    // normalize + flatten to EXACT training layout
    const vNorm = normalizeCenterScale(lmCrop);
    let feat;
    if (USE_XYZ) {
      feat = (FLATTEN_MODE==="grouped") ? flattenGroupedXYZ(vNorm) : flattenInterleavedXYZ(vNorm);
    } else {
      feat = (FLATTEN_MODE==="grouped") ? flattenGroupedXY(vNorm)  : flattenInterleavedXY(vNorm);
    }
    const input = standardize(feat, mean, scale);

    // predict
    let probs;
    try {
      probs = tf.tidy(() => {
        const x = tf.tensor(input, [1, feat.length], "float32");
        const y = model.predict(x);
        const p = y.softmax ? y.softmax() : y;
        const out = p.dataSync();
        tf.dispose([x,y,p]);
        return out;
      });
    } catch(e) { console.error("predict() failed:", e); onPredict({label:"—", conf:0, char:null}); return; }

    let k=0, best=-Infinity; for (let i=0;i<probs.length;i++) if (probs[i]>best){best=probs[i];k=i;}
    votes.push(k); if (votes.length>SMOOTH) votes.shift();
    const counts=new Map(); for(const t of votes) counts.set(t,(counts.get(t)||0)+1);
    let kStable=-1, mc=-1; for (const [kk,cc] of counts) if (cc>mc){kStable=kk;mc=cc;}

    const label = labels.get(kStable) ?? String(kStable);
    const conf  = Math.max(0, Math.min(1, best));

    // draw box + label (bottom-left INSIDE)
    ctx.lineWidth=2; ctx.strokeStyle="rgba(0,120,255,1)";
    ctx.strokeRect(x1,y1,bw,bh);

    const tag = `${label} ${(conf*100).toFixed(1)}%`;
    ctx.font = "16px Segoe UI";
    const tagH=20, pad=4, tw=ctx.measureText(tag).width+pad*2;
    const tagX = clamp(x1, 0, W-tw);
    const tagY = clamp(y2-tagH, 0, H-tagH);
    ctx.fillStyle="rgba(0,120,255,1)";
    ctx.fillRect(tagX, tagY, tw, tagH);
    ctx.fillStyle="#fff";
    ctx.fillText(tag, tagX+pad, tagY+tagH-6);

    // optional: draw dots for sanity
    if (SHOW_POINTS) {
      ctx.fillStyle="#00aaff";
      for (const p of lmFull) { ctx.beginPath(); ctx.arc(p.x,p.y,2.5,0,Math.PI*2); ctx.fill(); }
    }

    onPredict({ label: conf>=MIN_CONF_TAG ? label : "—", conf, char: null });
  });

  async function start(){
    if (running) return;
    stream = await navigator.mediaDevices.getUserMedia({ video:{facingMode:"user"}, audio:false });
    video.srcObject = stream;
    video.playsInline = true; video.muted = true;
    await video.play();

    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    video.style.transform = mirror ? "scaleX(-1)" : "none";

    running = true; loop();
  }
  async function loop(){
    if (!running) return;
    await hands.send({ image: video });
    const id = requestAnimationFrame(loop);
    setRAF(id);
  }
  async function stop(){
    running=false; setRAF(0);
    try{await hands.close();}catch{}
    try{stream?.getTracks?.().forEach(t=>t.stop());}catch{}
    try{video.pause(); video.srcObject=null; video.load?.();}catch{}
    video.style.transform="none";
    const W=canvas.width,H=canvas.height; canvas.getContext("2d")?.clearRect(0,0,W,H);
  }

  return { start, stop, stopAll: stop, setMirror: m=>{ video.style.transform = m ? "scaleX(-1)" : "none"; } };
}
