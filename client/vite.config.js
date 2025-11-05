// client/vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

// Flip this by running `npm run dev` (Firebase) vs `npm run dev:vercel` (Vercel)
const USE_VERCEL = process.env.USE_VERCEL === "1";
const API_TARGET = USE_VERCEL
  ? "http://localhost:3000"
  : "http://127.0.0.1:5001/handitalk-29b68/asia-southeast1";

// Figure out which web_api_client file actually exists
const TFLITE_DIST = path.resolve(
  process.cwd(),
  "node_modules/@tensorflow/tfjs-tflite/dist"
);
const CANDIDATES = [
  "tflite_web_api_client.mjs",
  "tflite_web_api_client.cjs",
  "tflite_web_api_client.js", // your shim from postinstall
];
let TFLITE_CLIENT_FILE = null;
for (const f of CANDIDATES) {
  const p = path.join(TFLITE_DIST, f);
  if (fs.existsSync(p)) { TFLITE_CLIENT_FILE = p; break; }
}

// Rewrite ../tflite_web_api_client inside the package to the actual file
function tfjsTfliteFix() {
  return {
    name: "tfjs-tflite-fix",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer || !TFLITE_CLIENT_FILE) return null;
      const norm = importer.replace(/\\/g, "/");
      const fromPkg =
        norm.includes("/node_modules/@tensorflow/tfjs-tflite/dist/") ||
        norm.includes("/node_modules/@tensorflow/tfjs-tflite/src/");
      const wants =
        source === "../tflite_web_api_client" || source === "./tflite_web_api_client";
      if (fromPkg && wants) return TFLITE_CLIENT_FILE;
      return null;
    },
  };
}

export default defineConfig({
  plugins: [react(), tfjsTfliteFix()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@pages": path.resolve(__dirname, "./src/pages"),
      "@components": path.resolve(__dirname, "./src/components"),
      "@lib": path.resolve(__dirname, "./src/lib"),
    },
  },
  // Re-enable optimizer; only skip tfjs-tflite so our plugin can handle it
  optimizeDeps: {
  exclude: ["@tensorflow/tfjs-tflite"],        // keep our rewrite working
  include: ["react", "react-dom", "long", "protobufjs"],  // prebundle UMDs
  },
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
