const CLOUD = import.meta.env.VITE_CLOUDINARY_CLOUD;
const PRESET = import.meta.env.VITE_CLOUDINARY_PRESET;

function assertEnv() {
  if (!CLOUD || !PRESET) throw new Error("Cloudinary env not set");
}

// Images + videos
export async function uploadMedia(file) {
  assertEnv();
  const url = `https://api.cloudinary.com/v1_1/${CLOUD}/auto/upload`;
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", PRESET);
  const res = await fetch(url, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json(); // { secure_url, public_id, ... }
}

// Raw files like .tflite
export async function uploadRaw(file) {
  assertEnv();
  const url = `https://api.cloudinary.com/v1_1/${CLOUD}/raw/upload`;
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", PRESET);
  const res = await fetch(url, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`Raw upload failed: ${res.status}`);
  return res.json();
}
