// client/scripts/patch-l2.js
import { readFileSync, writeFileSync } from "fs";
import path from "path";
const modelPath = path.resolve("client/public/models/phrases/model.json");
const txt = readFileSync(modelPath, "utf8");
const json = JSON.parse(txt);

// keys where regularizers may appear
const REG_KEYS = [
  "kernel_regularizer",
  "bias_regularizer",
  "activity_regularizer",
  "gamma_regularizer",
  "beta_regularizer",
  "depthwise_regularizer",
  "pointwise_regularizer",
  "recurrent_regularizer",
];

let changed = 0;

function fixReg(obj) {
  if (!obj || typeof obj !== "object") return;
  for (const k of REG_KEYS) {
    const r = obj[k];
    if (r && r.class_name === "L2") {
      const cfg = r.config || {};
      // Keras writes {"class_name":"L2","config":{"l2": <value>}}
      const l2v = cfg.l2 ?? cfg["l2"] ?? 0;
      obj[k] = {
        class_name: "L1L2",
        config: { l1: 0, l2: l2v },
      };
      changed++;
    }
  }
  // Recurse into any nested objects/arrays
  Object.values(obj).forEach(v => {
    if (Array.isArray(v)) v.forEach(fixReg);
    else if (v && typeof v === "object") fixReg(v);
  });
}

// Walk through model config
if (json && json.modelTopology && json.modelTopology.model_config) {
  fixReg(json.modelTopology.model_config);
} else if (json && json.modelTopology) {
  fixReg(json.modelTopology);
} else {
  fixReg(json);
}

writeFileSync(modelPath, JSON.stringify(json, null, 2));
console.log(`Patched ${changed} regularizer(s) from L2 -> L1L2`);
