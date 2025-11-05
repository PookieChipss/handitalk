import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./dev-expose.js"; // <-- add this line


// 👇 use the shared singleton
import { auth, db } from "@/lib/firebase.js";

// if you’re syncing progress to Firestore/localStorage on auth change:
import { initAuthProgressSync } from "@/lib/progressStore.js";

import "./index.css";

initAuthProgressSync(auth, db); // if your helper takes only (auth), drop db

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);