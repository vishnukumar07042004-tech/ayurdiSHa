import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./aym.css";
import "./styles/editorial.css";
import "./styles/tokens.css";
import "./styles/ui.css";
import "./styles/store.css";
import App from "./App.jsx";

/* A new deploy removes old hashed chunks; reload once so open tabs pick up the new build. */
window.addEventListener("vite:preloadError", (event) => {
  const key = "aym-chunk-reload";
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, "1");
  event.preventDefault();
  window.location.reload();
});
window.addEventListener("load", () => {
  window.setTimeout(() => sessionStorage.removeItem("aym-chunk-reload"), 10000);
});

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
