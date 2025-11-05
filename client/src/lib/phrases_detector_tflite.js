// TFJS-TFLite phrases detector that matches your Python pipeline:
// 1) Take MediaPipe landmarks from the FULL frame
// 2) Convert them to CROP-SPACE using the hand bbox
// 3) Canonicalize left->right, center+scale, standardize with your mean/std
// 4) Predict with TFLite model, EMA + majority vote smoothing

const tf = window.tf;
const tflite = window.tflite;
if (!tf) throw new Error("TFJS missing (window.tf).");
if (!tflite || !tflite.loadTFLiteModel) throw new Error("tfjs-tflite missing. Load /libs/tflite/tf-tflite.min.js and setWasmPath('/libs/tflite/').");
if (!window.Hands) throw new Error("MediaPipe Hands missing.");

const BASE       = "/models/phrases";
const TFLITE_URL = `${BASE}/sign_classifier_kfold_best.tflite`;
const LABELS_URL = `${BASE}/sign_labels.json`;
const NORM_URL   = `${BASE}/norm_stats.json`;

// ── Tuneables
const SMOOTH_FRAMES = 11;    // longer majority vote
const LOGIT_EMA = 0.65;      // smoother logits
const MIN_DET_CONF = 0.35;
const MIN_TRK_CONF = 0.45;
const PAD_PX = 4;
const DRAW_COLOR = "rgba(0,120,255,1)";
const INPUT_KEY = "serving_default_landmarks:0"; // from your console

// ── helpers
function meanOf(a){return a.reduce((x,y)=>x+y,0)/a.length;}
function bboxFromLandmarks(lm, mirror, W, H){
  let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
  for (const p of lm){
    const x=(mirror?1-p.x:p.x)*W, y=p.y*H;
    if (x<minX) minX=x; if (y<minY) minY=y; if (x>maxX) maxX=x; if (y>maxY) maxY=y;
  }
  const x1=Math.max(0,Math.floor(minX-PAD_PX));
  const y1=Math.max(0,Math.floor(minY-PAD_PX));
  const x2=Math.min(W-1,Math.ceil(maxX+PAD_PX));
  const y2=Math.min(H-1,Math.ceil(maxY+PAD_PX));
  return {x1,y1,x2,y2};
}

// convert frame-space landmarks -> crop-space [0..1] within the hand box
function toCropSpace(lm, box, mirror, W, H){
  const bw = Math.max(1, box.x2 - box.x1);
  const bh = Math.max(1, box.y2 - box.y1);
  const out = new Array(lm.length);
  for (let i=0;i<lm.length;i++){
    const fx = (mirror?1-lm[i].x:lm[i].x)*W;
    const fy = lm[i].y*H;
    const cx = (fx - box.x1) / bw;
    const cy = (fy - box.y1) / bh;
    out[i] = { x: Math.min(1,Math.max(0,cx)),
               y: Math.min(1,Math.max(0,cy)),
               z: lm[i].z ?? 0 };
  }
  return out;
}

// center-scale in the crop plane (exactly like your Python)
function normalizeCenterScale(lm){
  const xs = lm.map(p=>p.x), ys = lm.map(p=>p.y);
  const cx = meanOf(xs), cy = meanOf(ys);
  const shifted = lm.map(p=>({x:p.x-cx,y:p.y-cy,z:p.z}));
  let span = 0; for (const p of shifted) span = Math.max(span, Math.hypot(p.x,p.y));
  const s = span || 1;
  return shifted.map(p=>({x:p.x/s, y:p.y/s, z:p.z}));
}
function flatten63(lm){
  const v = new Float32Array(63); let i=0;
  for (const p of lm){ v[i++]=p.x; v[i++]=p.y; v[i++]=p.z; }
  return v;
}
function standardize(vec, mean, scale){
  const out = new Float32Array(vec.length);
  for (let i=0;i<vec.length;i++) out[i] = (vec[i]-mean[i])/(scale[i]+1e-6);
  return out;
}

export default async function PhrasesDetectorFactory(opts){
  const { video, canvas, mirror=true, onPredict=()=>{}, onHands=()=>{}, setRAF=()=>{} } = opts||{};
  if (!video || !canvas) throw new Error("video/canvas missing");

  const [model, labelsMap, normStats] = await Promise.all([
    tflite.loadTFLiteModel(TFLITE_URL),
    fetch(LABELS_URL).then(r=>r.json()),
    fetch(NORM_URL).then(r=>r.json()),
  ]);
  console.log("[phrases] model ready · input_names=",(model.inputs||[]).map(i=>i.name),"· output_names=",(model.outputs||[]).map(o=>o.name));

  const labels = new Map(Object.entries(labelsMap).map(([k,v])=>[Number(k),String(v)]));
  const mean   = new Float32Array(normStats.mean);
  const scale  = new Float32Array(normStats.scale);

  const hands = new window.Hands({ locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
  hands.setOptions({ maxNumHands:1, modelComplexity:1, minDetectionConfidence:MIN_DET_CONF, minTrackingConfidence:MIN_TRK_CONF });

  const ctx = canvas.getContext("2d");
  let running=false, rafId=0, stream=null;
  let ema=null; const votes=[];

  function softmax(v){
    const m = Math.max(...v); const ex = v.map(x=>Math.exp(x-m));
    const s = ex.reduce((a,b)=>a+b,0)||1; return ex.map(x=>x/s);
  }
  function predictProbs(vec63Std){
    return tf.tidy(()=>{
      const x = tf.tensor(vec63Std, [1,63], "float32");
      let y;
      try { y = model.predict(x); } catch { y = model.predict({[INPUT_KEY]:x}); }
      const logits = y.arraySync()[0];
      tf.dispose([x,y]);

      if (!ema) ema = logits.slice();
      else for (let i=0;i<ema.length;i++) ema[i] = LOGIT_EMA*ema[i] + (1-LOGIT_EMA)*logits[i];
      return softmax(ema);
    });
  }

  hands.onResults((res)=>{
    const lm = res.multiHandLandmarks?.[0];
    const num = res.multiHandLandmarks?.length || 0;
    onHands(num);

    const W=canvas.width, H=canvas.height;
    ctx.clearRect(0,0,W,H);
    if (!lm){ onPredict({label:"—",conf:0,char:null}); return; }

    // handedness & canonicalization (left->right)
    let isLeft=false;
    try {
      const lab = res.multiHandedness?.[0]?.classification?.[0]?.label||"";
      isLeft = lab.toLowerCase()==="left";
    } catch {}

    // 1) get a tight bbox in FRAME coords
    const frameBox = bboxFromLandmarks(lm, false, W, H); // mirror not applied for box; we’ll draw separately

    // 2) convert landmarks to CROP-SPACE within that box
    const lmCrop = toCropSpace(lm, frameBox, false, W, H);

    // 3) canonicalize in crop space (mirror left->right)
    const lmCanonCrop = lmCrop.map(p => ({ x: isLeft ? 1 - p.x : p.x, y: p.y, z: p.z }));

    // 4) center-scale in crop space, then standardize with your stats
    const v63 = flatten63(normalizeCenterScale(lmCanonCrop));
    const vStd = standardize(v63, mean, scale);

    // 5) predict
    const probs = predictProbs(vStd);
    let k=0, best=-Infinity; for (let i=0;i<probs.length;i++) if (probs[i]>best){best=probs[i];k=i;}
    votes.push(k); if (votes.length>SMOOTH_FRAMES) votes.shift();
    const cnt=new Map(); for (const x of votes) cnt.set(x,(cnt.get(x)||0)+1);
    let kStable=-1, mc=-1; for (const [kk,cc] of cnt) if (cc>mc){kStable=kk; mc=cc;}

    const label = labels.get(kStable) ?? String(kStable);
    const conf  = Math.max(0, Math.min(1, probs[k]));

    // Draw bbox (apply UI mirror only when drawing)
    const drawBox = bboxFromLandmarks(lm, true, W, H); // mirror for view only
    ctx.lineWidth=2; ctx.strokeStyle=DRAW_COLOR;
    ctx.strokeRect(drawBox.x1, drawBox.y1, drawBox.x2-drawBox.x1, drawBox.y2-drawBox.y1);
    const tag = `${label} ${(conf*100|0)}%`;
    ctx.font="14px Segoe UI";
    const tw=ctx.measureText(tag).width+8, tx=drawBox.x1+2, ty=Math.min(H-2, drawBox.y2-6);
    ctx.fillStyle=DRAW_COLOR; ctx.fillRect(tx,ty-16,tw,16);
    ctx.fillStyle="#fff"; ctx.fillText(tag, tx+4, ty-3);

    onPredict({label, conf, char:null});
  });

  async function start(){
    if (running) return;
    stream = await navigator.mediaDevices.getUserMedia({ video:{facingMode:"user"}, audio:false });
    video.srcObject = stream; video.playsInline = true; video.muted = true; await video.play();
    canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480;
    video.style.transform = mirror ? "scaleX(-1)" : "none";
    running = true; loop();
  }
  async function loop(){
    if (!running) return;
    await hands.send({ image: video });
    const id = requestAnimationFrame(loop); setRAF(id); rafId=id;
  }
  async function stop(){
    running=false; if (rafId) cancelAnimationFrame(rafId); setRAF(0);
    try{ await hands.close(); }catch{}
    try{ stream?.getTracks?.().forEach(t=>t.stop()); }catch{}
    stream=null; try{ video.pause(); video.srcObject=null; video.load?.(); }catch{}
    video.style.transform="none"; const {width,height}=canvas; canvas.getContext("2d").clearRect(0,0,width,height);
    ema=null; votes.length=0;
  }
  return { start, stop, stopAll:stop, setMirror:(m)=>{ video.style.transform=m?"scaleX(-1)":"none"; } };
}
