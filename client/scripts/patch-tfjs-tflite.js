// client/scripts/patch-tfjs-tflite.js
// Creates a JS shim that re-exports from whichever file exists:
// tflite_web_api_client.mjs OR tflite_web_api_client.cjs

import fs from "fs";
import path from "path";

const base = path.resolve("node_modules/@tensorflow/tfjs-tflite/dist");
const jsPath = path.join(base, "tflite_web_api_client.js");
const mjsPath = path.join(base, "tflite_web_api_client.mjs");
const cjsPath = path.join(base, "tflite_web_api_client.cjs");

if (!fs.existsSync(base)) {
  console.warn("[patch-tfjs-tflite] tfjs-tflite not installed yet.");
  process.exit(0);
}

let target = null;
if (fs.existsSync(mjsPath)) target = "tflite_web_api_client.mjs";
else if (fs.existsSync(cjsPath)) target = "tflite_web_api_client.cjs";

if (!target) {
  console.warn(
    "[patch-tfjs-tflite] Neither .mjs nor .cjs found in dist/. " +
    "Check package contents of @tensorflow/tfjs-tflite."
  );
  process.exit(0);
}

const content =
  `export * from './${target}';\nexport { default } from './${target}';\n`;

fs.writeFileSync(jsPath, content, "utf8");
console.log(`[patch-tfjs-tflite] wrote shim ${jsPath} -> ${target}`);
