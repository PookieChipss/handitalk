# HandiTalk - Real-Time Sign Language Interpreter Mobile App

*A Final Year Project by **Harvind Nair Selvam***  
Real-time and learning-oriented American Sign Language app with two pipelines:
**Fingerspelling (TFLite on the web)** and **Phrases (CSV-feature classifier)**.
Includes **Kid Mode**, **Admin tools**, and a **Text-to-Sign** demo.

---

## ✨ Highlights
- **Fingerspelling (Web TFLite)**: live camera → landmarks → letter prediction, ~95%+ test accuracy.
- **Phrases Classifier**: temporal landmark features → lightweight classifier for common phrases.
- **Text-to-Sign**: type a word/phrase to preview sign clips; shows a clean “No video to preview” state when unavailable.
- **Kid Mode**: larger UI, friendlier prompts, reduced controls.
- **Admin**: manage phrases and clips with Firebase Auth + Firestore + Storage.
- **Modern Frontend**: React + Vite; clean, responsive UI with sensible fallbacks.

---

## 🏗️ Architecture (quick view)
- **Frontend**: React (Vite), JS, CSS modules
- **ML**: MediaPipe Hands (21 landmarks) →  
  • *Fingerspelling:* normalized features → Web TFLite model  
  • *Phrases:* aggregated CSV-style features → lightweight classifier
- **Backend-as-a-Service**: Firebase (Auth, Firestore, Storage)

---

## 🚀 Quick Start
1) Clone and install  
   `git clone https://github.com/<your-username>/handitalk.git`  
   `cd handitalk && npm install`
2) Set environment (Vite)  
   Create a `.env` with your Firebase web config:
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
   `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`,
   `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`.
3) Run dev server  
   `npm run dev` → open the printed local URL.
4) Build & preview  
   `npm run build` then `npm run preview`.

*Tip:* If you ever see a blank screen, double-check `.env` values and that your Firestore/Storage rules allow the app to read necessary documents/files.

---

## 📁 Where things live (essential folders)
- `client/src/pages/` → app screens (e.g., TextToSign, KidMode, AdminPanel)
- `client/src/lib/` → Firebase bootstrap, providers, and ML helpers
- `models/fingerspelling/` → `handitalk_fingerspelling.tflite`, `class_names.json`
- `models/phrases/` → classifier artifact(s) + `feature_spec.json`
- `docs/screens/` → screenshots you reference in this README
- `docs/models/` → training/evaluation images (confusion matrix, curves)

---

## 🤖 Models & Evaluation (what to commit)
- Commit the **final** TFLite model + label map for Fingerspelling.
- Commit the **final** phrase classifier artifact and `feature_spec.json`.
- Put evaluation PNGs (confusion matrix, PR/ROC, loss/accuracy curves) under:
  - `docs/models/fingerspelling/…`
  - `docs/models/phrases/…`

If artifacts are large, use Git LFS.

---

## 🧩 Usage notes
- **No-clip case**: Text-to-Sign shows a clear “No video to preview” card.
- **Camera permissions**: Needs HTTPS on most browsers; allow camera access.
- **Optional cache**: You can enable Firestore persistence later if desired.

---

## 🙌 Acknowledgements
MediaPipe Hands • TensorFlow Lite • Open sign-language datasets and community

---

## 👤 Author
**Harvind Nair Selvam**  
Project: **HandiTalk - Real-Time Sign Language Interpreter Mobile App**
