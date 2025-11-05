import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

/* Normal and kid styles */
import "@/styles/home.css";
import "@/styles/kid/home-kid.css";

import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";

function getKidOn() {
  const b = document.body;
  return b.classList.contains("kid") || b.dataset.childmode === "1";
}

export default function Home() {
  const [name, setName] = useState("there");
  const [kidOn, setKidOn] = useState(getKidOn());

  useEffect(() => {
    let unsub = () => {};
    try {
      const auth = getAuth();
      const db = getFirestore();

      unsub = onAuthStateChanged(auth, async (user) => {
        if (!user) { setName("there"); return; }

        let n = user.displayName?.trim();
        if (!n) {
          try {
            const ref = doc(db, "users", user.uid);
            const snap = await getDoc(ref);
            if (snap.exists()) {
              const d = snap.data();
              n = d.displayName?.trim() || d.name?.trim();
            }
          } catch {}
        }
        if (!n) n = user.email?.split("@")[0] || "there";
        setName(n.charAt(0).toUpperCase() + n.slice(1));
      });
    } catch {
      setName("there");
    }

    const onKid = (e) => setKidOn(typeof e.detail === "boolean" ? e.detail : getKidOn());
    window.addEventListener("app:childmode", onKid);
    return () => { unsub && unsub(); window.removeEventListener("app:childmode", onKid); };
  }, []);

  const subtitle = kidOn ? "Pick a mode to play & learn!" : "Select Mode:";

  return (
    <div className="home-page">
      <header className="home-header">
        <div className="brand">
          <img className="brand-logo" src="/logo192.png" alt="" aria-hidden />
          <span className="brand-name">HandiTalk</span>
        </div>

        <Link to="/profile" className="profile-btn" aria-label="Profile">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Z" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M3.5 20.5a8.5 8.5 0 0 1 17 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </Link>
      </header>

      {/* main has two rows: hero (auto) + cards area (fills & centers vertically) */}
      <main className="home-main">
        <div className="hero">
          <h2 className="welcome">Welcome back, {name}</h2>
        </div>

        <div className="cards-center">
          {/* Move “Select Mode:” down here, left aligned above the cards */}
          <p className="subtitle">{subtitle}</p>

          <div className="card-container">
            <Link to="/sign-to-text" className="feature-card">
              <div className="icon-wrap camera" aria-hidden>
                <span className="emoji" role="img" aria-label="camera">📷</span>
              </div>
              <h3>Sign to Text</h3>
              <p>Camera-based real-time detection</p>
            </Link>

            <Link to="/text-to-sign" className="feature-card">
              <div className="icon-wrap text" aria-hidden>
                <span className="emoji" role="img" aria-label="text">📝</span>
              </div>
              <h3>Text to Sign</h3>
              <p>Type text and see sign videos</p>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
